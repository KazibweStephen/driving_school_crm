import uuid
from datetime import date, timedelta

from decimal import Decimal

from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.company import Branch, Expense
from app.models.consultation import Consultation
from app.models.payment import Payment
from app.models.permit import PermitProgress
from app.models.product import Package, Product
from app.models.user import UserRole


async def _verify_cart_item_company(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    if company_id is None:
        return True
    result = await db.execute(
        select(CartItem).join(Consultation, CartItem.consultation_id == Consultation.id)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .where(CartItem.id == cart_item_id,
               or_(Consultation.branch_id.is_(None), Branch.company_id == company_id))
    )
    return result.scalar_one_or_none() is not None


async def get_permit_progress(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> PermitProgress | None:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        return None
    result = await db.execute(
        select(PermitProgress).where(PermitProgress.cart_item_id == cart_item_id)
    )
    return result.scalar_one_or_none()


async def upsert_permit_progress(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    start_date: date | None = None,
    got_learners_permit_date: date | None = None,
    learners_due_date: date | None = None,
    learners_expiry_date: date | None = None,
    learners_permit_photo_url: str | None = None,
    test_ready: bool | None = None,
    waiting_for_permit: bool | None = None,
    permit_paid: bool | None = None,
    permit_received_date: date | None = None,
    tested_on_date: date | None = None,
    expecting_permit_on_date: date | None = None,
    delayed_days: int | None = None,
    notes: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> PermitProgress:
    existing = await get_permit_progress(db, cart_item_id, company_id=company_id, current_user_role=current_user_role)
    if existing:
        if start_date is not None:
            existing.start_date = start_date
        if got_learners_permit_date is not None:
            existing.got_learners_permit_date = got_learners_permit_date
        if learners_due_date is not None:
            existing.learners_due_date = learners_due_date
        if learners_expiry_date is not None:
            existing.learners_expiry_date = learners_expiry_date
        if learners_permit_photo_url is not None:
            existing.learners_permit_photo_url = learners_permit_photo_url
        if test_ready is not None:
            existing.test_ready = test_ready
        if waiting_for_permit is not None:
            existing.waiting_for_permit = waiting_for_permit
        if permit_paid is not None:
            existing.permit_paid = permit_paid
        if permit_received_date is not None:
            existing.permit_received_date = permit_received_date
            if waiting_for_permit is None:
                existing.waiting_for_permit = False
        if tested_on_date is not None:
            existing.tested_on_date = tested_on_date
            if waiting_for_permit is None:
                existing.waiting_for_permit = True
        if expecting_permit_on_date is not None:
            existing.expecting_permit_on_date = expecting_permit_on_date
        if delayed_days is not None:
            existing.delayed_days = delayed_days
        if notes is not None:
            existing.notes = notes
        await db.flush()
        await db.refresh(existing)
        return existing

    progress = PermitProgress(
        cart_item_id=cart_item_id,
        start_date=start_date,
        got_learners_permit_date=got_learners_permit_date,
        learners_due_date=learners_due_date,
        learners_expiry_date=learners_expiry_date,
        learners_permit_photo_url=learners_permit_photo_url,
        test_ready=bool(test_ready),
        waiting_for_permit=bool(waiting_for_permit),
        permit_paid=bool(permit_paid),
        permit_received_date=permit_received_date,
        tested_on_date=tested_on_date,
        expecting_permit_on_date=expecting_permit_on_date,
        delayed_days=delayed_days,
        notes=notes,
    )
    db.add(progress)
    await db.flush()
    await db.refresh(progress)
    return progress


# ── Permit tracker list (Permits page) ──────────────────────────────

def _display_name(c: Consultation) -> str:
    return " ".join(filter(None, [c.first_name, c.middle_name, c.last_name])).strip() or "—"


async def list_permit_trackers(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None,
    branch_ids: list[uuid.UUID] | None = None,
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list, int]:
    """List cart items that require permit processing with their payment progress."""
    query = (
        select(CartItem)
        .join(Consultation, CartItem.consultation_id == Consultation.id)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .options(
            selectinload(CartItem.consultation).selectinload(Consultation.branch)
        )
        .where(CartItem.requires_permit_processing.is_(True))
    )
    if company_id is not None:
        query = query.where(
            or_(Consultation.branch_id.is_(None), Branch.company_id == company_id)
        )
    if branch_ids:
        query = query.where(Consultation.branch_id.in_(branch_ids))

    search_term = (search or "").strip()
    if search_term:
        like = f"%{search_term.lower()}%"
        query = query.where(
            or_(
                func.lower(Consultation.first_name).like(like),
                func.lower(Consultation.middle_name).like(like),
                func.lower(Consultation.last_name).like(like),
                Consultation.phone.like(like),
            )
        )

    count = await db.execute(select(func.count()).select_from(query.subquery()))
    total = int(count.scalar() or 0)

    query = (
        query.order_by(CartItem.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(query)).scalars().all()

    # Load permit progress for all cart items in this page
    progress_map: dict[uuid.UUID, PermitProgress] = {}
    if rows:
        pp_rows = await db.execute(
            select(PermitProgress).where(
                PermitProgress.cart_item_id.in_([ci.id for ci in rows])
            )
        )
        progress_map = {p.cart_item_id: p for p in pp_rows.scalars().all()}

    # Load product + package names
    product_ids = {ci.product_id for ci in rows if ci.product_id}
    package_ids = {ci.package_id for ci in rows if ci.package_id}
    products: dict[str, str] = {}
    if product_ids:
        prods = await db.execute(
            select(Product.id, Product.name).where(Product.id.in_([uuid.UUID(p) for p in product_ids]))
        )
        products = {str(pid): name for pid, name in prods.all()}
    packages: dict[str, str] = {}
    if package_ids:
        pkgs = await db.execute(
            select(Package.id, Package.name, Package.price).where(
                Package.id.in_([uuid.UUID(p) for p in package_ids])
            )
        )
        packages = {str(pid): (name, float(price)) for pid, name, price in pkgs.all()}

    trackers: list[dict] = []
    for ci in rows:
        cons = ci.consultation
        pp = progress_map.get(ci.id)
        package_info = packages.get(ci.package_id) if ci.package_id else None
        total_amount = package_info[1] if package_info else 0.0
        total_paid = await _paid_for_cart_item(db, ci)
        balance = max(0.0, total_amount - total_paid)
        ratio = (total_paid / total_amount) if total_amount > 0 else 0.0

        tracker = {
            "cart_item_id": ci.id,
            "consultation_id": cons.id,
            "client_name": _display_name(cons),
            "client_phone": cons.phone or "—",
            "branch_id": cons.branch_id,
            "branch_name": cons.branch.name if cons.branch else None,
            "product_id": ci.product_id,
            "product_name": products.get(ci.product_id, "Product"),
            "package_id": ci.package_id,
            "package_name": package_info[0] if package_info else None,
            "total_amount": total_amount,
            "total_paid": total_paid,
            "balance": balance,
            "paid_ratio": ratio,
            "start_date": pp.start_date if pp else None,
            "got_learners_permit_date": pp.got_learners_permit_date if pp else None,
            "learners_due_date": pp.learners_due_date if pp else None,
            "learners_expiry_date": pp.learners_expiry_date if pp else None,
            "learners_permit_photo_url": pp.learners_permit_photo_url if pp else None,
            "test_ready": bool(pp.test_ready) if pp else False,
            "waiting_for_permit": bool(pp.waiting_for_permit) if pp else False,
            "permit_paid": bool(pp.permit_paid) if pp else False,
            "permit_received_date": pp.permit_received_date if pp else None,
            "tested_on_date": pp.tested_on_date if pp else None,
            "expecting_permit_on_date": pp.expecting_permit_on_date if pp else None,
            "delayed_days": pp.delayed_days if pp else None,
            "notes": pp.notes if pp else None,
        }
        trackers.append(tracker)

    if status:
        trackers = [
            t for t in trackers if compute_tracker_status(t) == status
        ]

    total = len(trackers) if status else total
    for t in trackers:
        t["status"] = compute_tracker_status(t)
    return trackers, total


def compute_tracker_status(t: dict) -> str:
    if t.get("permit_received_date"):
        return "permit_received"
    if t.get("permit_paid"):
        return "permit_paid"
    if t.get("tested_on_date") or t.get("waiting_for_permit"):
        return "waiting_for_permit"
    if t.get("test_ready"):
        return "test_ready"
    if not t.get("got_learners_permit_date"):
        return "eligible" if (t.get("paid_ratio") or 0) >= 0.5 else "not_qualified"
    if t.get("learners_due_date") and t["learners_due_date"] <= date.today():
        return "due_for_testing"
    return "learners_active"


async def _paid_for_cart_item(db: AsyncSession, ci: CartItem) -> float:
    rows = await db.execute(
        select(Payment.total_paid).where(
            Payment.consultation_id == ci.consultation_id,
            Payment.product_id == ci.product_id,
            Payment.cancelled_at.is_(None),
        )
    )
    total = sum((Decimal(r[0]) for r in rows.all()), Decimal("0"))
    return float(total)


# ── Expense → permit auto-marking ──────────────────────────────────

def categorize_permit_expense(category: str | None) -> str | None:
    """Classify an expense category into a permit milestone.

    Returns one of: "learner", "test", "permit", or None.
    Matching is done on the category's code (when resolvable) then name.
    """
    if not category:
        return None
    low = category.lower()
    # learner permit check first (subset of "permit")
    if "learner" in low and "permit" in low:
        return "learner"
    if "test" in low:
        return "test"
    if "permit" in low:
        return "permit"
    return None


async def apply_permit_expense_effects(
    db: AsyncSession,
    expense: Expense,
    idempotent: bool = True,
) -> int:
    """When a paid Expense is linked to a consultation, auto-mark the
    consultation's permit-processing cart items:

    - "test"  category → test_ready = True
    - "permit" category → permit_paid = True (waiting resolved)
    - "learner" category → ensure a progress row exists (dates captured manually)

    Returns the number of cart items updated.
    """
    if expense.consultation_id is None:
        return 0
    kind = categorize_permit_expense(expense.category)
    if kind is None:
        return 0
    rows = await db.execute(
        select(CartItem).where(
            CartItem.consultation_id == expense.consultation_id,
            CartItem.requires_permit_processing.is_(True),
        )
    )
    cart_items = rows.scalars().all()
    updated = 0
    for ci in cart_items:
        progress = await upsert_permit_progress(db, ci.id)
        if kind == "test" and not progress.test_ready:
            progress.test_ready = True
            updated += 1
        elif kind == "permit":
            was = bool(progress.permit_paid)
            progress.permit_paid = True
            progress.waiting_for_permit = False
            if not was:
                updated += 1
    await db.flush()
    return updated