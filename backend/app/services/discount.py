import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Branch, UserBranchAssignment
from app.models.discount import CartItemDiscount, Discount, DiscountAppliesTo, DiscountStatus, DiscountType
from app.models.product import Package, Product
from app.models.user import User, UserRole


async def _get_company_branches(db: AsyncSession, company_id: uuid.UUID):
    result = await db.execute(select(Branch.id).where(Branch.company_id == company_id))
    return {row[0] for row in result.all()}


async def get_accessible_branch_ids(db: AsyncSession, current_user: User) -> list[uuid.UUID]:
    """Return branch IDs the current user can see notifications for."""
    privileged_roles = {
        UserRole.SUPER_USER,
        UserRole.COMPANY_SUPER_USER,
        UserRole.OFFICE_ADMIN,
        UserRole.MANAGER,
        UserRole.BRANCH_SUPERVISOR,
    }
    if current_user.role in privileged_roles:
        if current_user.role == UserRole.SUPER_USER and current_user.company_id is None:
            # Fall back to all branches if no company context
            result = await db.execute(select(Branch.id))
        else:
            result = await db.execute(
                select(Branch.id).where(Branch.company_id == current_user.company_id)
            )
        return [row[0] for row in result.all()]

    # Non-privileged users only see their assigned branches
    result = await db.execute(
        select(UserBranchAssignment.branch_id)
        .join(Branch)
        .where(
            UserBranchAssignment.user_id == current_user.phone,
            Branch.company_id == current_user.company_id,
        )
    )
    return [row[0] for row in result.all()]


async def _validate_applies_to_ids(
    db: AsyncSession,
    company_id: uuid.UUID,
    applies_to: DiscountAppliesTo,
    product_ids: list[uuid.UUID] | None,
    package_ids: list[uuid.UUID] | None,
):
    if applies_to == DiscountAppliesTo.ALL:
        return

    if applies_to == DiscountAppliesTo.PRODUCT:
        if not product_ids:
            raise ValueError("product_ids required when applies_to is 'product'")
        result = await db.execute(
            select(Product.id).where(
                Product.id.in_(product_ids),
                Product.company_id == company_id,
            )
        )
        valid = {row[0] for row in result.all()}
        invalid = set(product_ids) - valid
        if invalid:
            raise ValueError("One or more product_ids do not belong to the company")
        return

    if applies_to == DiscountAppliesTo.PACKAGE:
        if not package_ids:
            raise ValueError("package_ids required when applies_to is 'package'")
        result = await db.execute(
            select(Package.id).where(
                Package.id.in_(package_ids),
                Package.product_id == Product.id,
                Product.company_id == company_id,
            )
        )
        valid = {row[0] for row in result.all()}
        invalid = set(package_ids) - valid
        if invalid:
            raise ValueError("One or more package_ids do not belong to the company")
        return


def _serialize_ids(ids: list[uuid.UUID] | None) -> list[str] | None:
    if not ids:
        return None
    return [str(i) for i in ids]


async def create_discount(
    db: AsyncSession,
    data: dict,
    company_id: uuid.UUID,
    requested_by: str,
) -> Discount:
    branch_id = data["branch_id"]
    branch = await db.get(Branch, branch_id)
    if branch is None or branch.company_id != company_id:
        raise ValueError("Branch not found or does not belong to the company")

    applies_to = DiscountAppliesTo(data["applies_to"])
    await _validate_applies_to_ids(
        db,
        company_id,
        applies_to,
        data.get("product_ids"),
        data.get("package_ids"),
    )

    discount_type = DiscountType(data["discount_type"])
    discount_value = data["discount_value"]
    if discount_type == DiscountType.PERCENTAGE and discount_value > 100:
        raise ValueError("Percentage discount cannot exceed 100")

    # Check code uniqueness within company
    existing = await db.execute(
        select(Discount).where(
            Discount.company_id == company_id,
            Discount.code == data["code"],
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Discount code already exists in this company")

    discount = Discount(
        code=data["code"],
        name=data["name"],
        description=data.get("description"),
        discount_type=discount_type,
        discount_value=discount_value,
        applies_to=applies_to,
        product_ids=_serialize_ids(data.get("product_ids")),
        package_ids=_serialize_ids(data.get("package_ids")),
        start_date=data["start_date"],
        end_date=data.get("end_date"),
        is_active=data.get("is_active", True),
        status=DiscountStatus.PENDING,
        requested_by=requested_by,
        branch_id=branch_id,
        company_id=company_id,
        max_uses=data.get("max_uses"),
    )
    db.add(discount)
    await db.flush()
    await db.refresh(
        discount,
        attribute_names=["branch", "requested_by_user", "approved_by_user"],
    )
    return discount


async def get_discount(db: AsyncSession, discount_id: uuid.UUID, company_id: uuid.UUID | None = None) -> Discount | None:
    query = (
        select(Discount)
        .options(
            selectinload(Discount.branch),
            selectinload(Discount.requested_by_user),
            selectinload(Discount.approved_by_user),
        )
        .where(Discount.id == discount_id)
    )
    if company_id:
        query = query.where(Discount.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_discount_by_code(db: AsyncSession, code: str, company_id: uuid.UUID) -> Discount | None:
    result = await db.execute(
        select(Discount).where(
            Discount.company_id == company_id,
            Discount.code == code,
        )
    )
    return result.scalar_one_or_none()


async def list_discounts(
    db: AsyncSession,
    company_id: uuid.UUID,
    search: str | None = None,
    status: DiscountStatus | None = None,
    branch_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Discount], int]:
    query = (
        select(Discount)
        .options(
            selectinload(Discount.branch),
            selectinload(Discount.requested_by_user),
            selectinload(Discount.approved_by_user),
        )
        .where(Discount.company_id == company_id)
    )

    if search:
        query = query.where(
            or_(
                Discount.code.ilike(f"%{search}%"),
                Discount.name.ilike(f"%{search}%"),
            )
        )
    if status:
        query = query.where(Discount.status == status)
    if branch_id:
        query = query.where(Discount.branch_id == branch_id)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Discount.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def update_discount(
    db: AsyncSession,
    discount: Discount,
    data: dict,
) -> Discount:
    if discount.status not in (DiscountStatus.DRAFT, DiscountStatus.PENDING):
        raise ValueError("Only draft or pending discounts can be edited")

    if "code" in data and data["code"] is not None:
        existing = await db.execute(
            select(Discount).where(
                Discount.company_id == discount.company_id,
                Discount.code == data["code"],
                Discount.id != discount.id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Discount code already exists in this company")
        discount.code = data["code"]

    if "name" in data and data["name"] is not None:
        discount.name = data["name"]
    if "description" in data:
        discount.description = data["description"]
    if "discount_value" in data and data["discount_value"] is not None:
        if discount.discount_type == DiscountType.PERCENTAGE and data["discount_value"] > 100:
            raise ValueError("Percentage discount cannot exceed 100")
        discount.discount_value = data["discount_value"]
    if "applies_to" in data and data["applies_to"] is not None:
        new_applies_to = DiscountAppliesTo(data["applies_to"])
        await _validate_applies_to_ids(
            db,
            discount.company_id,
            new_applies_to,
            data.get("product_ids"),
            data.get("package_ids"),
        )
        discount.applies_to = new_applies_to
    if "product_ids" in data:
        discount.product_ids = _serialize_ids(data["product_ids"])
    if "package_ids" in data:
        discount.package_ids = _serialize_ids(data["package_ids"])
    if "start_date" in data and data["start_date"] is not None:
        discount.start_date = data["start_date"]
    if "end_date" in data:
        discount.end_date = data["end_date"]
    if "is_active" in data and data["is_active"] is not None:
        discount.is_active = data["is_active"]
    if "max_uses" in data:
        discount.max_uses = data["max_uses"]

    # Re-validate dates
    if discount.end_date is not None and discount.start_date > discount.end_date:
        raise ValueError("start_date must be before or equal to end_date")

    await db.flush()
    await db.refresh(
        discount,
        attribute_names=["branch", "requested_by_user", "approved_by_user"],
    )
    return discount


async def approve_discount(
    db: AsyncSession,
    discount: Discount,
    approved_by: str,
    reason: str | None = None,
    approved_by_role: UserRole | None = None,
) -> Discount:
    if discount.status != DiscountStatus.PENDING:
        raise ValueError("Only pending discounts can be approved")
    
    # Self-approval allowed for privileged roles only
    if discount.requested_by == approved_by:
        privileged_self_approve_roles = {
            UserRole.SUPER_USER,
            UserRole.COMPANY_SUPER_USER,
            UserRole.MANAGER,
        }
        if approved_by_role not in privileged_self_approve_roles:
            raise ValueError("You cannot approve your own discount")

    discount.status = DiscountStatus.APPROVED
    discount.approved_by = approved_by
    discount.approved_at = datetime.now(timezone.utc)
    discount.rejection_reason = None

    await db.flush()
    await db.refresh(
        discount,
        attribute_names=["branch", "requested_by_user", "approved_by_user", "updated_at"],
    )
    return discount


async def reject_discount(
    db: AsyncSession,
    discount: Discount,
    rejected_by: str,
    reason: str,
) -> Discount:
    if discount.status != DiscountStatus.PENDING:
        raise ValueError("Only pending discounts can be rejected")
    if discount.requested_by == rejected_by:
        raise ValueError("You cannot reject your own discount")

    discount.status = DiscountStatus.REJECTED
    discount.approved_by = None
    discount.approved_at = None
    discount.rejection_reason = reason

    await db.flush()
    await db.refresh(
        discount,
        attribute_names=["branch", "requested_by_user", "approved_by_user", "updated_at"],
    )
    return discount


async def toggle_discount_active(
    db: AsyncSession,
    discount: Discount,
) -> Discount:
    if discount.status == DiscountStatus.EXPIRED:
        raise ValueError("Expired discounts cannot be reactivated")
    discount.is_active = not discount.is_active
    await db.flush()
    await db.refresh(
        discount,
        attribute_names=["branch", "requested_by_user", "approved_by_user"],
    )
    return discount


def compute_discount_amount(discount: Discount, package_price: float) -> float:
    if discount.discount_type == DiscountType.FIXED:
        return min(float(discount.discount_value), package_price)
    return round(package_price * float(discount.discount_value) / 100, 2)


async def _get_cart_item_package_price(
    db: AsyncSession,
    cart_item,
) -> float:
    """Resolve the package price for a cart item."""
    if cart_item.package_id:
        package = await db.get(Package, cart_item.package_id)
        if package and package.price is not None:
            return float(package.price)
    # Fallback: look up product's first package price
    if cart_item.product_id:
        result = await db.execute(
            select(Package).where(
                Package.product_id == cart_item.product_id,
                Package.status == "active",
            ).limit(1)
        )
        package = result.scalar_one_or_none()
        if package and package.price is not None:
            return float(package.price)
    raise ValueError("Could not resolve package price for cart item")


async def _discount_applies_to_cart_item(db: AsyncSession, discount: Discount, cart_item) -> bool:
    if discount.applies_to == DiscountAppliesTo.ALL:
        return True
    if discount.applies_to == DiscountAppliesTo.PRODUCT:
        ids = discount.product_ids or []
        return str(cart_item.product_id) in ids
    if discount.applies_to == DiscountAppliesTo.PACKAGE:
        ids = discount.package_ids or []
        return str(cart_item.package_id) in ids if cart_item.package_id else False
    return False


async def _discount_applies_to_product(
    discount: Discount,
    product_id: uuid.UUID | str,
    package_id: uuid.UUID | str | None,
) -> bool:
    if discount.applies_to == DiscountAppliesTo.ALL:
        return True
    if discount.applies_to == DiscountAppliesTo.PRODUCT:
        ids = discount.product_ids or []
        return str(product_id) in ids
    if discount.applies_to == DiscountAppliesTo.PACKAGE:
        ids = discount.package_ids or []
        return str(package_id) in ids if package_id else False
    return False


async def get_applicable_discounts_for_product(
    db: AsyncSession,
    company_id: uuid.UUID,
    product_id: uuid.UUID | str,
    package_id: uuid.UUID | str | None,
) -> list[Discount]:
    """Return active, non-expired discounts (approved or pending) that apply to a product/package."""
    today = date.today()
    query = (
        select(Discount)
        .options(selectinload(Discount.branch), selectinload(Discount.requested_by_user))
        .where(
            Discount.company_id == company_id,
            Discount.status.in_([DiscountStatus.APPROVED, DiscountStatus.PENDING]),
            Discount.is_active == True,
            Discount.start_date <= today,
            or_(Discount.end_date.is_(None), Discount.end_date >= today),
            or_(
                Discount.max_uses.is_(None),
                Discount.used_count < Discount.max_uses,
            ),
        )
    )
    result = await db.execute(query)
    discounts = result.scalars().all()
    applicable = []
    for d in discounts:
        if await _discount_applies_to_product(d, product_id, package_id):
            applicable.append(d)
    return applicable


async def apply_discount_to_cart_item(
    db: AsyncSession,
    discount_id: uuid.UUID,
    cart_item_id: uuid.UUID,
    applied_by: str,
    company_id: uuid.UUID,
) -> CartItemDiscount:
    from app.models.cart import CartItem

    discount = await get_discount(db, discount_id, company_id)
    if discount is None:
        raise ValueError("Discount not found")

    cart_item = await db.get(CartItem, cart_item_id)
    if cart_item is None:
        raise ValueError("Cart item not found")

    # Load discount links to check existing application
    result = await db.execute(
        select(CartItemDiscount).where(
            CartItemDiscount.cart_item_id == cart_item_id,
            CartItemDiscount.discount_id == discount_id,
        )
    )
    if result.scalar_one_or_none():
        raise ValueError("Discount already applied to this cart item")

    # Allow both approved and pending discounts to be applied
    # Pending discounts will need approval after being applied to a sale
    if discount.status not in (DiscountStatus.APPROVED, DiscountStatus.PENDING):
        raise ValueError("Discount must be approved or pending to be applied")

    if not discount.is_active:
        raise ValueError("Discount is not active")

    today = date.today()
    if discount.start_date > today:
        raise ValueError("Discount has not started yet")
    if discount.end_date is not None and discount.end_date < today:
        raise ValueError("Discount has expired")

    if discount.max_uses is not None and discount.used_count >= discount.max_uses:
        raise ValueError("Discount usage limit reached")

    if not await _discount_applies_to_cart_item(db, discount, cart_item):
        raise ValueError("Discount does not apply to this cart item")

    package_price = await _get_cart_item_package_price(db, cart_item)
    applied_amount = compute_discount_amount(discount, package_price)

    link = CartItemDiscount(
        cart_item_id=cart_item_id,
        discount_id=discount_id,
        applied_amount=applied_amount,
        applied_by=applied_by,
    )
    db.add(link)
    discount.used_count += 1

    await db.flush()
    await db.refresh(link, attribute_names=["discount"])
    return link


async def remove_discount_from_cart_item(
    db: AsyncSession,
    cart_item_discount_id: uuid.UUID,
    company_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(CartItemDiscount)
        .options(selectinload(CartItemDiscount.discount))
        .where(CartItemDiscount.id == cart_item_discount_id)
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise ValueError("Discount application not found")
    if link.discount.company_id != company_id:
        raise ValueError("Discount does not belong to this company")

    await db.delete(link)
    if link.discount.used_count > 0:
        link.discount.used_count -= 1
    await db.flush()


async def get_cart_item_discounts(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
) -> list[CartItemDiscount]:
    result = await db.execute(
        select(CartItemDiscount)
        .options(selectinload(CartItemDiscount.discount))
        .where(CartItemDiscount.cart_item_id == cart_item_id)
    )
    return list(result.scalars().all())


async def expire_discounts(db: AsyncSession) -> int:
    today = date.today()
    result = await db.execute(
        select(Discount).where(
            Discount.status == DiscountStatus.APPROVED,
            Discount.end_date.isnot(None),
            Discount.end_date < today,
            Discount.is_active == True,
        )
    )
    expired = result.scalars().all()
    for d in expired:
        d.status = DiscountStatus.EXPIRED
        d.is_active = False
    await db.flush()
    return len(expired)


async def get_pending_discount_notifications(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    accessible_branch_ids: list[uuid.UUID],
    limit: int = 20,
) -> list[Discount]:
    if not accessible_branch_ids:
        return []
    query = (
        select(Discount)
        .options(selectinload(Discount.branch), selectinload(Discount.requested_by_user))
        .where(
            Discount.status == DiscountStatus.PENDING,
            Discount.branch_id.in_(accessible_branch_ids),
        )
    )
    if company_id:
        query = query.where(Discount.company_id == company_id)
    query = query.order_by(Discount.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_applicable_discounts(
    db: AsyncSession,
    company_id: uuid.UUID,
    cart_item,
) -> list[Discount]:
    """Return active, non-expired discounts (approved or pending) that apply to a cart item.

    Pending discounts can be selected during first payment; they require approval after
    being applied to the sale.
    """
    today = date.today()
    query = (
        select(Discount)
        .options(selectinload(Discount.branch), selectinload(Discount.requested_by_user))
        .where(
            Discount.company_id == company_id,
            Discount.status.in_([DiscountStatus.APPROVED, DiscountStatus.PENDING]),
            Discount.is_active == True,
            Discount.start_date <= today,
            or_(Discount.end_date.is_(None), Discount.end_date >= today),
            or_(
                Discount.max_uses.is_(None),
                Discount.used_count < Discount.max_uses,
            ),
        )
    )
    result = await db.execute(query)
    discounts = result.scalars().all()

    applicable = []
    for d in discounts:
        if await _discount_applies_to_cart_item(db, d, cart_item):
            applicable.append(d)
    return applicable
