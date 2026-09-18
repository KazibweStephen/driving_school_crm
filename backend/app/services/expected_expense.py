import uuid
from decimal import Decimal

from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import ExpenseCategory
from app.models.expected_expense import ExpectedExpenseItem, PackageExpenseLink
from app.models.product import Package


async def list_items(
    db: AsyncSession,
    company_id: uuid.UUID,
    active_only: bool = False,
) -> list[ExpectedExpenseItem]:
    stmt = select(ExpectedExpenseItem).where(
        ExpectedExpenseItem.company_id == company_id
    )
    if active_only:
        stmt = stmt.where(ExpectedExpenseItem.is_active.is_(True))
    stmt = stmt.order_by(ExpectedExpenseItem.name.asc())
    return list((await db.execute(stmt)).scalars().all())


async def get_item(
    db: AsyncSession, item_id: uuid.UUID
) -> ExpectedExpenseItem | None:
    return (
        await db.execute(select(ExpectedExpenseItem).where(ExpectedExpenseItem.id == item_id))
    ).scalar_one_or_none()


async def create_item(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: dict,
    created_by: str | None = None,
) -> ExpectedExpenseItem:
    item = ExpectedExpenseItem(
        company_id=company_id,
        name=data["name"].strip(),
        category_id=data.get("category_id"),
        unit_cost=Decimal(str(data.get("unit_cost", 0) or 0)),
        default_multiplier=Decimal(str(data.get("default_multiplier", 1) or 1)),
        description=data.get("description"),
        is_active=bool(data.get("is_active", True)),
    )
    db.add(item)
    await db.flush()
    return item


async def update_item(
    db: AsyncSession, item: ExpectedExpenseItem, data: dict
) -> ExpectedExpenseItem:
    if "name" in data and data["name"] is not None:
        item.name = str(data["name"]).strip()
    if "category_id" in data:
        item.category_id = data["category_id"]
    if "unit_cost" in data and data["unit_cost"] is not None:
        item.unit_cost = Decimal(str(data["unit_cost"]))
    if "default_multiplier" in data and data["default_multiplier"] is not None:
        item.default_multiplier = Decimal(str(data["default_multiplier"]))
    if "description" in data:
        item.description = data.get("description")
    if "is_active" in data:
        item.is_active = bool(data["is_active"])
    await db.flush()
    return item


async def delete_item(db: AsyncSession, item: ExpectedExpenseItem) -> None:
    await db.delete(item)
    await db.flush()


async def get_package_available_items(
    db: AsyncSession,
    package_id: uuid.UUID,
    company_id: uuid.UUID,
) -> list[ExpectedExpenseItem]:
    """All active catalogue items, flagged with whether they are already linked
    to this package (so the UI can show checked state + existing multiplier)."""
    return await list_items(db, company_id, active_only=True)


async def get_package_links(
    db: AsyncSession, package_id: uuid.UUID, company_id: uuid.UUID
) -> dict:
    """Returns the package's selected expected expenses with computed line
    totals and the grand total (active items only, current catalogue rates)."""
    stmt = (
        select(PackageExpenseLink, ExpectedExpenseItem, ExpenseCategory.name)
        .join(ExpectedExpenseItem, ExpectedExpenseItem.id == PackageExpenseLink.item_id)
        .outerjoin(ExpenseCategory, ExpenseCategory.id == ExpectedExpenseItem.category_id)
        .where(
            PackageExpenseLink.package_id == package_id,
            ExpectedExpenseItem.company_id == company_id,
            ExpectedExpenseItem.is_active.is_(True),
        )
    )
    rows = (await db.execute(stmt)).all()

    items = []
    total = Decimal("0")
    for link, item, cat_name in rows:
        unit_cost = Decimal(item.unit_cost)
        multiplier = Decimal(link.multiplier)
        line_total = (unit_cost * multiplier).quantize(Decimal("0.01"))
        total += line_total
        items.append(
            {
                "link_id": str(link.id),
                "item_id": str(item.id),
                "name": item.name,
                "category_id": str(item.category_id) if item.category_id else None,
                "category_name": cat_name,
                "unit_cost": float(unit_cost),
                "multiplier": float(multiplier),
                "line_total": float(line_total),
            }
        )
    return {"package_id": str(package_id), "items": items, "total": float(total)}


async def set_package_links(
    db: AsyncSession,
    package_id: uuid.UUID,
    company_id: uuid.UUID,
    links: list[dict],
) -> dict:
    """Replace the package's selection: [{item_id, multiplier}]. Multiplier
    falls back to the item's default_multiplier when not provided."""
    from fastapi import HTTPException

    pkg = (
        await db.execute(select(Package).where(Package.id == package_id))
    ).scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    await db.execute(
        sa_delete(PackageExpenseLink).where(PackageExpenseLink.package_id == package_id)
    )
    for link in links:
        item_id = uuid.UUID(str(link["item_id"]))
        item = await get_item(db, item_id)
        if not item or item.company_id != company_id:
            continue
        multiplier = Decimal(str(link.get("multiplier") or item.default_multiplier or 1))
        if multiplier <= 0:
            continue
        db.add(
            PackageExpenseLink(
                package_id=package_id, item_id=item_id, multiplier=multiplier
            )
        )
    await db.flush()
    return await get_package_links(db, package_id, company_id)


async def compute_package_total(
    db: AsyncSession, package_id: uuid.UUID, company_id: uuid.UUID
) -> Decimal:
    data = await get_package_links(db, package_id, company_id)
    return Decimal(str(data["total"] or 0))


async def get_cart_item_expense_types(
    db: AsyncSession,
    cart_item,
    company_id: uuid.UUID,
) -> list[dict]:
    """The expense types (categories) the user should choose from when filing
    an expense against a cart item, derived from the expenses tagged to the
    cart item's package:
      - legacy per-package rows (PackageExpectedExpense: category + amount)
      - catalogue links (PackageExpenseLink -> ExpectedExpenseItem.name)
    Each entry returns category, a suggested amount, and whether an expense for
    this cart_item_id + category already exists (so it can be shown as paid).
    Fuel is intentionally excluded (fuel expense is computed per lesson).
    """
    from app.models.cart import CartItem
    from app.models.company import Expense, ExpenseStatus
    from app.models.product import PackageExpectedExpense

    if cart_item.package_id is None or not _valid_uuid(cart_item.package_id):
        return []

    package_id = uuid.UUID(cart_item.package_id)

    # Legacy per-package expected expenses (category + amount).
    rows = (
        await db.execute(
            select(PackageExpectedExpense).where(
                PackageExpectedExpense.package_id == package_id
            )
        )
    ).scalars().all()
    by_category: dict[str, dict] = {}
    for r in rows:
        key = (r.category or "").strip().lower()
        if not key or "fuel" in key:
            continue
        by_category.setdefault(
            key, {"category": r.category.strip(), "amount": float(r.amount)}
        )

    # Catalogue-linked expected expense items (name is the expense type).
    links = await get_package_links(db, package_id, company_id)
    for line in links["items"]:
        name = line.get("name") or line.get("category_name") or ""
        key = name.strip().lower()
        if not key or "fuel" in key:
            continue
        item = by_category.get(key)
        if item is None:
            by_category[key] = {"category": name.strip(), "amount": float(line.get("line_total") or 0)}

    # Mark already-paid: an expense already exists for this cart item + category.
    existing = (
        await db.execute(
            select(Expense.category)
            .where(
                Expense.cart_item_id == cart_item.id,
                Expense.status != ExpenseStatus.REJECTED,
            )
        )
    ).scalars().all()
    paid_categories = {str(c).strip().lower() for c in existing}

    result = []
    for key, item in by_category.items():
        result.append({**item, "already_paid": key in paid_categories})
    result.sort(key=lambda x: (x["already_paid"], x["category"]))
    return result


async def cart_item_expected_categories(
    db: AsyncSession,
    cart_item,
    company_id: uuid.UUID,
) -> set[str]:
    """Lowercase set of expense-type categories tagged to a cart item's package
    (fuel excluded). Used by the finance duplicate guard so each tagged type is
    only ever filed once per cart item."""
    return {
        e["category"].lower()
        for e in await get_cart_item_expense_types(db, cart_item, company_id)
    }


async def cart_item_expected_amount(
    db: AsyncSession,
    cart_item_id,
    category: str,
    company_id: uuid.UUID,
) -> float | None:
    """The allocated (expected) amount for a single tagged expense type on a
    cart item's package, or None when the category is not tagged. Used to cap
    the filed amount (amount + charges cannot exceed the allocation)."""
    from app.models.cart import CartItem

    item = (
        await db.execute(select(CartItem).where(CartItem.id == cart_item_id))
    ).scalar_one_or_none()
    if not item:
        return None
    low = (category or "").strip().lower()
    if not low:
        return None
    for e in await get_cart_item_expense_types(db, item, company_id):
        if e["category"].lower() == low:
            return float(e.get("amount") or 0)
    return None


def _valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except Exception:
        return False
