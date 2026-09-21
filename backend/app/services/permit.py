import uuid
from datetime import date, datetime, timedelta

from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.company import Branch, Expense, ExpenseCategory
from app.models.consultation import Consultation
from app.models.discount import CartItemDiscount
from app.models.payment import Payment
from app.models.permit import PermitAuditLog, PermitProgress
from app.models.product import Package, Product
from app.models.user import User, UserRole
from app.services.expected_expense import cart_item_expected_amount
from app.utils.timezones import BUSINESS_TZ, today_local


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


# ── Audit logging ──────────────────────────────────────────────────

def _fmt(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


async def add_audit_log(
    db: AsyncSession,
    progress: PermitProgress,
    field_changed: str,
    old_value,
    new_value,
    changed_by: str | None = None,
    changed_by_name: str | None = None,
    reason: str | None = None,
) -> None:
    old_s = _fmt(old_value)
    new_s = _fmt(new_value)
    if old_s == new_s and reason is None:
        return
    db.add(
        PermitAuditLog(
            progress_id=progress.id,
            cart_item_id=progress.cart_item_id,
            field_changed=field_changed,
            old_value=old_s,
            new_value=new_s,
            changed_by=changed_by,
            changed_by_name=changed_by_name,
            reason=reason,
        )
    )


async def list_audit_logs(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None,
    user_role: UserRole | None,
) -> list[PermitAuditLog]:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, user_role):
        return []
    result = await db.execute(
        select(PermitAuditLog)
        .where(PermitAuditLog.cart_item_id == cart_item_id)
        .order_by(PermitAuditLog.created_at.desc())
    )
    return list(result.scalars().all())


async def override_eligibility(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    eligible: bool,
    reason: str,
    current_user: User,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> PermitProgress:
    """Manually override a client's permit eligibility (e.g. they qualified
    but the payment ratio is below the 0.5 threshold). Records an audit entry."""
    if not reason or not reason.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Reason is required when overriding eligibility")
    progress = await upsert_permit_progress(db, cart_item_id, company_id=company_id,
                                            current_user_role=current_user_role)
    progress.eligibility_overridden = True
    progress.eligibility_override_reason = f"{'eligible' if eligible else 'not_qualified'}: {reason.strip()}"
    await add_audit_log(
        db, progress,
        field_changed="eligibility",
        old_value="auto" if eligible else "eligible",
        new_value="eligible" if eligible else "not_qualified",
        changed_by=current_user.phone,
        changed_by_name=(current_user.first_name or "") + " " + (current_user.last_name or ""),
        reason=reason.strip(),
    )
    await db.flush()
    await db.refresh(progress)
    return progress


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
    test_date: date | None = None,
    expecting_permit_on_date: date | None = None,
    delayed_days: int | None = None,
    notes: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
    changed_by: str | None = None,
    changed_by_name: str | None = None,
) -> PermitProgress:
    existing = await get_permit_progress(db, cart_item_id, company_id=company_id, current_user_role=current_user_role)
    if existing:
        _apply_update(existing, start_date=start_date, got_learners_permit_date=got_learners_permit_date,
                      learners_due_date=learners_due_date, learners_expiry_date=learners_expiry_date,
                      learners_permit_photo_url=learners_permit_photo_url,
                      test_ready=test_ready, waiting_for_permit=waiting_for_permit,
                      permit_paid=permit_paid, permit_received_date=permit_received_date,
                      tested_on_date=tested_on_date, test_date=test_date,
                      expecting_permit_on_date=expecting_permit_on_date,
                      delayed_days=delayed_days, notes=notes)
        if changed_by is not None:
            await audit_changes(db, existing, changed_by=changed_by, changed_by_name=changed_by_name)
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
        test_date=test_date,
        expecting_permit_on_date=expecting_permit_on_date,
        delayed_days=delayed_days,
        notes=notes,
    )
    db.add(progress)
    await db.flush()
    await db.refresh(progress)
    return progress


def _apply_update(progress: PermitProgress, **kwargs) -> None:
    if kwargs.get("start_date") is not None:
        progress.start_date = kwargs["start_date"]
    if kwargs.get("got_learners_permit_date") is not None:
        progress.got_learners_permit_date = kwargs["got_learners_permit_date"]
    if kwargs.get("learners_due_date") is not None:
        progress.learners_due_date = kwargs["learners_due_date"]
    if kwargs.get("learners_expiry_date") is not None:
        progress.learners_expiry_date = kwargs["learners_expiry_date"]
    if kwargs.get("learners_permit_photo_url") is not None:
        progress.learners_permit_photo_url = kwargs["learners_permit_photo_url"]
    if kwargs.get("test_ready") is not None:
        progress.test_ready = kwargs["test_ready"]
    if kwargs.get("waiting_for_permit") is not None:
        progress.waiting_for_permit = kwargs["waiting_for_permit"]
    if kwargs.get("permit_paid") is not None:
        progress.permit_paid = kwargs["permit_paid"]
    if kwargs.get("permit_received_date") is not None:
        progress.permit_received_date = kwargs["permit_received_date"]
        if kwargs.get("waiting_for_permit") is None:
            progress.waiting_for_permit = False
    if kwargs.get("tested_on_date") is not None:
        progress.tested_on_date = kwargs["tested_on_date"]
        if kwargs.get("waiting_for_permit") is None:
            progress.waiting_for_permit = True
    if kwargs.get("test_date") is not None:
        progress.test_date = kwargs["test_date"]
    if kwargs.get("expecting_permit_on_date") is not None:
        progress.expecting_permit_on_date = kwargs["expecting_permit_on_date"]
    if kwargs.get("delayed_days") is not None:
        progress.delayed_days = kwargs["delayed_days"]
    if kwargs.get("notes") is not None:
        progress.notes = kwargs["notes"]


async def audit_changes(
    db: AsyncSession,
    progress: PermitProgress,
    changed_by: str,
    changed_by_name: str | None,
) -> None:
    """Log every PermitProgress attribute that changed (vs. when loaded)."""
    from sqlalchemy.orm.attributes import get_history
    for attr in ("start_date", "got_learners_permit_date", "learners_due_date",
                 "learners_expiry_date", "learners_permit_photo_url", "test_ready",
                 "waiting_for_permit", "permit_paid", "permit_received_date",
                 "tested_on_date", "test_date", "expecting_permit_on_date",
                 "delayed_days", "notes"):
        hist = get_history(progress, attr)
        if hist.deleted or hist.added:
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            await add_audit_log(db, progress, attr, old, new,
                                changed_by=changed_by, changed_by_name=changed_by_name)


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
    sort_by: str = "created_desc",
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

    def _order_cols():
        if sort_by == "document_date_asc":
            return (Consultation.document_date.asc().nulls_last(), Consultation.created_at.asc())
        if sort_by == "document_date_desc":
            return (Consultation.document_date.desc().nulls_last(), Consultation.created_at.desc())
        return (CartItem.created_at.desc(),)

    if status:
        # Status is computed in Python from progress + expense kinds + paid
        # ratio, so it cannot be pushed into SQL. Fetch ALL matching rows,
        # compute statuses, then filter + paginate in Python — otherwise
        # matches beyond the current DB page vanish and total is wrong.
        rows = (await db.execute(query.order_by(*_order_cols()))).scalars().all()
        trackers = await _build_permit_trackers(db, rows)
        if sort_by == "document_date_asc":
            trackers.sort(key=lambda t: ((t["document_date"] or date.max), str(t["cart_item_id"])))
        elif sort_by == "document_date_desc":
            trackers.sort(
                key=lambda t: ((t["document_date"] or date.min), str(t["cart_item_id"])),
                reverse=True,
            )
        filtered = [t for t in trackers if t["status"] == status]
        total = len(filtered)
        start = (page - 1) * page_size
        return filtered[start:start + page_size], total

    query = (
        query.order_by(*_order_cols())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(query)).scalars().all()
    trackers = await _build_permit_trackers(db, rows)
    return trackers, total


async def _build_permit_trackers(
    db: AsyncSession, rows: list[CartItem],
) -> list[dict]:
    # Load permit progress for all cart items in this page
    progress_map: dict[uuid.UUID, PermitProgress] = {}
    if rows:
        pp_rows = await db.execute(
            select(PermitProgress).where(
                PermitProgress.cart_item_id.in_([ci.id for ci in rows])
            )
        )
        progress_map = {p.cart_item_id: p for p in pp_rows.scalars().all()}

    # Applied discounts per cart item (effective price = package price − discounts)
    discount_map: dict[uuid.UUID, float] = {}
    if rows:
        disc_rows = await db.execute(
            select(CartItemDiscount.cart_item_id, CartItemDiscount.applied_amount).where(
                CartItemDiscount.cart_item_id.in_([ci.id for ci in rows])
            )
        )
        for cid, amount in disc_rows.all():
            discount_map.setdefault(cid, 0.0)
            discount_map[cid] += float(amount)

    # Permit expenses per consultation/cart item (all statuses). When an
    # expense has cart_item_id, it's linked to that specific cart item;
    # otherwise it falls back to the consultation. For each permit kind we keep
    # the most advanced status (paid > approved > pending; rejected is ignored).
    consultation_ids = {ci.consultation_id for ci in rows}
    expense_kinds_status: dict[uuid.UUID, dict[str, str]] = {}
    _STATUS_PRIORITY = {"pending": 1, "approved": 2, "paid": 3}
    if consultation_ids:
        exp_rows = await db.execute(
            select(
                Expense.consultation_id,
                Expense.cart_item_id,
                Expense.category,
                Expense.status,
            )
            .where(Expense.consultation_id.in_(consultation_ids))
        )
        for cid, cart_item_id, category, exp_status in exp_rows.all():
            exp_status = exp_status.value if hasattr(exp_status, "value") else exp_status
            if exp_status not in _STATUS_PRIORITY:
                continue
            kind = categorize_permit_expense(category)
            if kind is None:
                continue
            # If expense has cart_item_id, key by cart_item_id; otherwise by consultation_id
            key = cart_item_id if cart_item_id else cid
            current = expense_kinds_status.get(key, {}).get(kind)
            if current is None or _STATUS_PRIORITY[exp_status] > _STATUS_PRIORITY[current]:
                expense_kinds_status.setdefault(key, {})[kind] = exp_status

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
        discount_amount = discount_map.get(ci.id, 0.0)
        effective_total = max(0.0, total_amount - discount_amount)
        total_paid = await _paid_for_cart_item(db, ci)
        balance = max(0.0, effective_total - total_paid)
        ratio = (total_paid / effective_total) if effective_total > 0 else 0.0

        tracker = {
            "cart_item_id": ci.id,
            "consultation_id": cons.id,
            "client_name": _display_name(cons),
            "client_phone": cons.phone or "—",
            "document_date": cons.document_date,
            "branch_id": cons.branch_id,
            "branch_name": cons.branch.name if cons.branch else None,
            "product_id": ci.product_id,
            "product_name": products.get(ci.product_id, "Product"),
            "package_id": ci.package_id,
            "package_name": package_info[0] if package_info else None,
            "total_amount": effective_total,
            "discount_amount": discount_amount,
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
            "test_date": pp.test_date if pp else None,
            "expecting_permit_on_date": pp.expecting_permit_on_date if pp else None,
            "delayed_days": pp.delayed_days if pp else None,
            "notes": pp.notes if pp else None,
            "eligibility_overridden": bool(pp.eligibility_overridden) if pp else False,
            "eligibility_override_reason": pp.eligibility_override_reason if pp else None,
        }
        # Look up expense kinds: prefer cart_item_id match, fall back to consultation_id
        kinds = expense_kinds_status.get(ci.id) or expense_kinds_status.get(cons.id) or {}
        tracker["learner_expense_status"] = kinds.get("learner")
        tracker["testing_expense_status"] = kinds.get("test")
        tracker["permit_expense_status"] = kinds.get("permit")
        tracker["learner_expense_paid"] = kinds.get("learner") == "paid"
        tracker["testing_expense_paid"] = kinds.get("test") == "paid"
        tracker["permit_expense_paid"] = kinds.get("permit") == "paid"
        tracker["status"] = compute_tracker_status(tracker)
        trackers.append(tracker)

    return trackers


def compute_tracker_status(t: dict) -> str:
    if t.get("permit_received_date"):
        return "permit_received"
    if t.get("permit_paid"):
        return "permit_paid"
    if t.get("tested_on_date") or t.get("waiting_for_permit"):
        pstat = t.get("permit_expense_status")
        if pstat == "pending":
            return "permit_pending_approval"
        if pstat == "approved":
            return "permit_pending_payment"
        return "waiting_for_permit"
    if t.get("test_ready"):
        return "test_ready"
    if not t.get("got_learners_permit_date"):
        lstat = t.get("learner_expense_status")
        if lstat == "pending":
            return "learner_pending_approval"
        if lstat == "approved":
            return "learner_pending_payment"
        if lstat == "paid":
            return "learner_paid"
        if t.get("eligibility_overridden"):
            return "eligible"
        return "eligible" if (t.get("paid_ratio") or 0) >= 0.5 else "not_qualified"
    if t.get("learners_due_date") and t["learners_due_date"] <= today_local():
        tstat = t.get("testing_expense_status")
        if tstat == "pending":
            return "test_pending_approval"
        if tstat == "approved":
            return "test_pending_payment"
        return "due_for_testing"
    return "learners_active"


_PERMIT_NOTIFY_MESSAGES = {
    "learner_pending_approval": "Learner Permit Payment expense is pending approval",
    "learner_pending_payment": "Learner Permit Payment is approved — mark it paid",
    "learner_paid": "Learner Permit Payment is paid — add the learner's permit issue date",
    "test_pending_approval": "Testing dues are pending approval",
    "test_pending_payment": "Testing dues are approved — mark them paid",
    "test_ready": "Testing dues are paid — add the scheduled test date",
    "permit_pending_approval": "Permit Payment expense is pending approval",
    "permit_pending_payment": "Permit Payment is approved — mark it paid",
    "permit_paid": "Permit Payment is paid — add the tested-on and permit received dates",
}


async def list_permit_notifications(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None,
    branch_ids: list[uuid.UUID] | None = None,
    limit: int = 20,
) -> list[dict]:
    """Permit trackers that currently need an admin action (computed on read).

    Mirrors `list_permit_trackers` scoping but returns only tracker statuses
    that indicate a pending approval, an approved-but-unpaid expense, or a paid
    stage still missing its date(s). Newest first.
    """
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
    rows = (await db.execute(query.order_by(CartItem.created_at.desc()))).scalars().all()

    progress_map: dict[uuid.UUID, PermitProgress] = {}
    if rows:
        pp_rows = await db.execute(
            select(PermitProgress).where(
                PermitProgress.cart_item_id.in_([ci.id for ci in rows])
            )
        )
        progress_map = {p.cart_item_id: p for p in pp_rows.scalars().all()}

    # Permit expense statuses per cart item/consultation (most-advanced wins),
    # plus the newest created_at among them for recency ordering.
    consultation_ids = {ci.consultation_id for ci in rows}
    expense_kinds_status: dict[uuid.UUID, dict[str, str]] = {}
    expense_kinds_created: dict[uuid.UUID, dict[str, datetime]] = {}
    _STATUS_PRIORITY = {"pending": 1, "approved": 2, "paid": 3}
    if consultation_ids:
        exp_rows = await db.execute(
            select(
                Expense.consultation_id,
                Expense.cart_item_id,
                Expense.category,
                Expense.status,
                Expense.created_at,
            )
            .where(Expense.consultation_id.in_(consultation_ids))
        )
        for cid, cart_item_id, category, exp_status, exp_created in exp_rows.all():
            exp_status = exp_status.value if hasattr(exp_status, "value") else exp_status
            if exp_status not in _STATUS_PRIORITY:
                continue
            kind = categorize_permit_expense(category)
            if kind is None:
                continue
            key = cart_item_id if cart_item_id else cid
            current = expense_kinds_status.get(key, {}).get(kind)
            if current is None or _STATUS_PRIORITY[exp_status] > _STATUS_PRIORITY[current]:
                expense_kinds_status.setdefault(key, {})[kind] = exp_status
                expense_kinds_created.setdefault(key, {})[kind] = exp_created
            else:
                prev_created = expense_kinds_created.get(key, {}).get(kind)
                if prev_created is None or exp_created > prev_created:
                    expense_kinds_created.setdefault(key, {})[kind] = exp_created

    items: list[dict] = []
    for ci in rows:
        cons = ci.consultation
        pp = progress_map.get(ci.id)
        tracker = {
            "permit_received_date": pp.permit_received_date if pp else None,
            "permit_paid": bool(pp.permit_paid) if pp else False,
            "tested_on_date": pp.tested_on_date if pp else None,
            "waiting_for_permit": bool(pp.waiting_for_permit) if pp else False,
            "test_ready": bool(pp.test_ready) if pp else False,
            "got_learners_permit_date": pp.got_learners_permit_date if pp else None,
            "eligibility_overridden": bool(pp.eligibility_overridden) if pp else False,
            "learners_due_date": pp.learners_due_date if pp else None,
            "paid_ratio": 0.0,
        }
        kinds = expense_kinds_status.get(ci.id) or expense_kinds_status.get(cons.id) or {}
        tracker["learner_expense_status"] = kinds.get("learner")
        tracker["testing_expense_status"] = kinds.get("test")
        tracker["permit_expense_status"] = kinds.get("permit")
        status = compute_tracker_status(tracker)
        message = _PERMIT_NOTIFY_MESSAGES.get(status)
        if message is None:
            continue
        created = (
            expense_kinds_created.get(ci.id) or expense_kinds_created.get(cons.id) or {}
        )
        latest = None
        for kind in ("learner", "test", "permit"):
            ts = created.get(kind)
            if ts is not None and (latest is None or ts > latest):
                latest = ts
        items.append({
            "id": ci.id,
            "cart_item_id": ci.id,
            "consultation_id": cons.id,
            "client_name": _display_name(cons),
            "client_phone": cons.phone or "—",
            "branch_id": cons.branch_id,
            "branch_name": cons.branch.name if cons.branch else None,
            "status": status,
            "message": message,
            "created_at": (latest or ci.created_at),
        })

    items.sort(key=lambda i: i["created_at"], reverse=True)
    return items[:limit]


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


# ── Permit expense date helpers ────────────────────────────────────

# Only these exact categories are treated as permit-processing milestones
# (broader keyword matching in categorize_permit_expense is for status only).
_PERMIT_CATEGORY_NAMES = {
    "learner permit payment",
    "test booking",
    "police booking",
    "iov fees",
    "permit payment",
}


def is_permit_processing_category(category: str | None) -> bool:
    if not category:
        return False
    return category.strip().lower() in _PERMIT_CATEGORY_NAMES


async def _first_payment_date(
    db: AsyncSession,
    consultation_id: uuid.UUID,
    product_id: str | None = None,
) -> date | None:
    query = select(Payment).where(
        Payment.consultation_id == consultation_id,
        Payment.cancelled_at.is_(None),
    )
    if product_id:
        query = query.where(Payment.product_id == product_id)
    query = query.order_by(
        Payment.document_date.asc().nulls_last(), Payment.created_at.asc()
    ).limit(1)
    payment = (await db.execute(query)).scalar_one_or_none()
    if payment is None:
        return None
    if payment.document_date is not None:
        return payment.document_date
    if payment.created_at is not None:
        return payment.created_at.astimezone(BUSINESS_TZ).date()
    return None


async def _permit_cart_item(
    db: AsyncSession,
    consultation_id: uuid.UUID | None,
    cart_item_id: uuid.UUID | None = None,
) -> CartItem | None:
    if cart_item_id:
        return (
            await db.execute(
                select(CartItem).where(
                    CartItem.id == cart_item_id,
                    CartItem.requires_permit_processing.is_(True),
                )
            )
        ).scalar_one_or_none()
    if consultation_id is None:
        return None
    return (
        await db.execute(
            select(CartItem)
            .where(
                CartItem.consultation_id == consultation_id,
                CartItem.requires_permit_processing.is_(True),
            )
            .order_by(CartItem.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def permit_date_floor(
    db: AsyncSession,
    consultation_id: uuid.UUID | None,
    category: str | None,
    cart_item_id: uuid.UUID | None = None,
) -> date | None:
    """Earliest permitted day for a permit-processing expense's dates: the first
    payment date of the linked permit cart item. ``None`` for non-permit
    expenses (no constraint)."""
    if consultation_id is None or not is_permit_processing_category(category):
        return None
    ci = await _permit_cart_item(db, consultation_id, cart_item_id)
    if ci is None:
        return None
    return await _first_payment_date(db, ci.consultation_id, ci.product_id)


async def _effective_total_for_cart_item(db: AsyncSession, ci: CartItem) -> float:
    total = 0.0
    if ci.package_id:
        price = (
            await db.execute(select(Package.price).where(Package.id == ci.package_id))
        ).scalar_one_or_none()
        total = float(price) if price is not None else 0.0
    discount = (
        await db.execute(
            select(func.coalesce(func.sum(CartItemDiscount.applied_amount), 0)).where(
                CartItemDiscount.cart_item_id == ci.id
            )
        )
    ).scalar() or 0
    return max(0.0, total - float(discount))


async def _learner_permit_payment_date(
    db: AsyncSession, consultation_id: uuid.UUID
) -> date | None:
    rows = (
        await db.execute(
            select(Expense).where(Expense.consultation_id == consultation_id)
        )
    ).scalars().all()
    best: date | None = None
    for e in rows:
        if categorize_permit_expense(e.category) != "learner":
            continue
        if e.paid_at is not None:
            d = e.paid_at.astimezone(BUSINESS_TZ).date()
        elif e.expense_date is not None:
            d = e.expense_date.astimezone(BUSINESS_TZ).date()
        else:
            continue
        if best is None or d < best:
            best = d
    return best


async def _qualifying_installment_date(
    db: AsyncSession, ci: CartItem, effective_total: float
) -> date | None:
    """The document date of the payment whose cumulative total first reached
    learners-permit eligibility (>= 50% of the effective total)."""
    if effective_total <= 0:
        return None
    target = Decimal(str(effective_total * 0.5))
    rows = (
        (
            await db.execute(
                select(Payment)
                .where(
                    Payment.consultation_id == ci.consultation_id,
                    Payment.product_id == ci.product_id,
                    Payment.cancelled_at.is_(None),
                )
                .order_by(Payment.document_date.asc().nulls_last(), Payment.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    cumulative = Decimal("0")
    for p in rows:
        cumulative += Decimal(str(p.total_paid or 0))
        if cumulative >= target:
            if p.document_date is not None:
                return p.document_date
            if p.created_at is not None:
                return p.created_at.astimezone(BUSINESS_TZ).date()
            return None
    return None


async def _police_booking_date(
    db: AsyncSession, consultation_id: uuid.UUID
) -> date | None:
    """Earliest dated/paid Police Booking expense on a consultation."""
    rows = (
        await db.execute(
            select(Expense).where(Expense.consultation_id == consultation_id)
        )
    ).scalars().all()
    best: date | None = None
    for e in rows:
        if (e.category or "").strip().lower() != "police booking":
            continue
        if e.paid_at is not None:
            d = e.paid_at.astimezone(BUSINESS_TZ).date()
        elif e.expense_date is not None:
            d = e.expense_date.astimezone(BUSINESS_TZ).date()
        else:
            continue
        if best is None or d < best:
            best = d
    return best


def _capped_default_date(
    base: date | None, days: int, cap_to_today: bool = True
) -> date | None:
    """base + days, capped to today when that lands in the future."""
    if base is None:
        return None
    candidate = base + timedelta(days=days)
    if not cap_to_today:
        return candidate
    today = today_local()
    return candidate if candidate < today else today


async def default_permit_expense_date(
    db: AsyncSession,
    consultation_id: uuid.UUID | None,
    category: str | None,
    cart_item_id: uuid.UUID | None = None,
) -> date | None:
    """Default document date for a permit-processing expense.

    - Learner permit payment: the date of the payment/installment whose
      cumulative amount first made the client eligible for a learners permit
      (>= 50% paid, or the eligibility was overridden) — falling back to the
      client's first payment date. ``None`` when not yet eligible.
    - Test Booking / Police Booking / IOV Fees: 31 days after that learner
      payment date (fallback: the learner-permit expense payment date).
    - Permit Payment: 7 days after the client's earliest Police Booking date,
      else the test-stage defaults.
    Date candidates landing in the future are capped to today.
    """
    kind = categorize_permit_expense(category)
    if kind is None or consultation_id is None:
        return None
    ci = await _permit_cart_item(db, consultation_id, cart_item_id)
    if ci is None:
        return None

    async def _is_eligible() -> bool:
        progress = (
            await db.execute(
                select(PermitProgress).where(PermitProgress.cart_item_id == ci.id)
            )
        ).scalar_one_or_none()
        if progress and progress.eligibility_overridden:
            return True
        effective = await _effective_total_for_cart_item(db, ci)
        paid = await _paid_for_cart_item(db, ci)
        return effective > 0 and (paid / effective) >= 0.5

    async def _learner_default() -> date | None:
        effective = await _effective_total_for_cart_item(db, ci)
        qualifying = await _qualifying_installment_date(db, ci, effective)
        if qualifying:
            return qualifying
        return await _first_payment_date(db, ci.consultation_id, ci.product_id)

    if kind == "learner":
        if not await _is_eligible():
            return None
        return await _learner_default()

    if kind == "test":
        effective = await _effective_total_for_cart_item(db, ci)
        qualifying = await _qualifying_installment_date(db, ci, effective)
        base = qualifying
        if base is None:
            base = await _learner_permit_payment_date(db, ci.consultation_id)
        return _capped_default_date(base, 31, cap_to_today=True)

    # permit stage
    police = await _police_booking_date(db, ci.consultation_id)
    if police:
        return _capped_default_date(police, 7, cap_to_today=True)
    effective = await _effective_total_for_cart_item(db, ci)
    qualifying = await _qualifying_installment_date(db, ci, effective)
    base = qualifying or await _learner_permit_payment_date(db, ci.consultation_id)
    return _capped_default_date(base, 31, cap_to_today=True)


# ── Expense → permit auto-marking ──────────────────────────────────

def categorize_permit_expense(category: str | None) -> str | None:
    """Classify an expense category into a permit milestone.

    Returns one of: "learner", "test", "permit", or None.
    Matching is done on the category's code (when resolvable) then name.
    """
    if not category:
        return None
    low = category.lower().replace("_", " ").strip()
    # learner permit check first (subset of "permit")
    if "learner" in low and "permit" in low:
        return "learner"
    if low in ("test booking", "police booking", "iov fees") or all(
        token in low for token in ("test", "book")
    ):
        return "test"
    if "iov" in low:
        return "test"
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

    When the expense has a cart_item_id, only that specific cart item is
    updated. Otherwise all permit-processing cart items on the consultation
    are updated (backward compatibility).

    Returns the number of cart items updated.
    """
    if expense.consultation_id is None:
        return 0
    kind = categorize_permit_expense(expense.category)
    if kind is None:
        return 0
    # If expense already has cart_item_id, target only that cart item
    if expense.cart_item_id:
        rows = await db.execute(
            select(CartItem).where(
                CartItem.id == expense.cart_item_id,
                CartItem.consultation_id == expense.consultation_id,
                CartItem.requires_permit_processing.is_(True),
            )
        )
    else:
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


async def record_permit_expense(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    expense_items: list[dict],
    expense_date: datetime | None,
    current_user: User,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> PermitProgress:
    """Record stage-required permit expenses directly from the permits page.

    Resolves each expense category (company-scoped), then creates a PAID expense
    linked to the cart item's consultation. Because the expenses are created as
    paid + consultation-linked, `apply_permit_expense_effects` fires and the
    permit stage advances automatically (test → `test_ready`, permit →
    `permit_paid`). Returns the updated permit progress.
    """
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        raise HTTPException(status_code=404, detail="Cart item not found")

    ci = (await db.execute(select(CartItem).where(CartItem.id == cart_item_id))).scalar_one_or_none()
    if ci is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    cons = (
        await db.execute(
            select(Consultation).where(Consultation.id == ci.consultation_id)
        )
    ).scalar_one_or_none()
    if cons is None:
        raise HTTPException(status_code=404, detail="Client not found")
    if cons.branch_id is None:
        raise HTTPException(
            status_code=400,
            detail="This client has no branch; cannot record an expense. Assign a branch first.",
        )

    # Import lazily to avoid circular import (finance lazy-imports permit).
    from app.services.finance import create_expense

    for item in expense_items:
        category_code = item.get("category_code")
        if category_code not in _PERMIT_CATEGORY_CODES:
            raise HTTPException(status_code=400, detail=f"Unknown permit expense category: {category_code}")
        category_name = _PERMIT_CATEGORY_RESOLVE[category_code]
        amount = float(item.get("amount") or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail=f"Amount is required for {category_name}")
        account = await _resolve_expense_account(db, cons.branch_id, category_name, company_id)
        await create_expense(
            db,
            branch_id=cons.branch_id,
            amount=amount,
            description=item.get("description") or f"{category_name} — {cons.first_name} {cons.last_name}".strip(),
            category=category_name,
            consultation_id=cons.id,
            expense_date=expense_date,
            status="paid",  # paid → apply_permit_expense_effects runs inside create_expense
            account=account,
            created_by_phone=current_user.phone,
            company_id=company_id,
            current_user_role=current_user_role,
        )
    await db.flush()

    progress = await upsert_permit_progress(
        db, cart_item_id, company_id=company_id, current_user_role=current_user_role
    )
    await db.refresh(progress)
    return progress


_PERMIT_CATEGORY_CODES = {
    "learner_permit_payment",
    "test_booking",
    "police_booking",
    "iov_fees",
    "permit_payment",
}

_PERMIT_CATEGORY_RESOLVE = {
    "learner_permit_payment": "Learner Permit Payment",
    "test_booking": "Test Booking",
    "police_booking": "Police Booking",
    "iov_fees": "IOV Fees",
    "permit_payment": "Permit Payment",
}


async def _resolve_expense_account(
    db: AsyncSession,
    branch_id: uuid.UUID,
    category_name: str,
    company_id: uuid.UUID | None,
) -> str:
    if company_id is None:
        branch = (await db.execute(select(Branch).where(Branch.id == branch_id))).scalar_one_or_none()
        company_id = branch.company_id if branch else None
    if company_id is not None:
        match = (
            await db.execute(
                select(ExpenseCategory).where(
                    ExpenseCategory.company_id == company_id,
                    ExpenseCategory.name == category_name,
                )
            )
        ).scalar_one_or_none()
        if match is not None:
            return match.account
    return "client_accounts"


# Ordered permit expense categories shown in the client-profile checklist.
_PERMIT_CATEGORY_ORDER = [
    ("learner_permit_payment", "Learner Permit Payment"),
    ("test_booking", "Test Booking"),
    ("police_booking", "Police Booking"),
    ("iov_fees", "IOV Fees"),
    ("permit_payment", "Permit Payment"),
]


async def list_permit_expense_checklist(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> dict:
    """All permit-processing expense categories for a client's permit cart item.

    For each category the most recent filed expense (any status) is returned so
    the UI can file/approve/pay it. ``can_file`` is True only when nothing has
    been filed yet or the latest expense was rejected (declined) — deleted
    expenses leave no row, so they are naturally re-fileable.
    """
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        raise HTTPException(status_code=404, detail="Cart item not found")

    ci = (await db.execute(select(CartItem).where(CartItem.id == cart_item_id))).scalar_one_or_none()
    if ci is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    cons = (
        await db.execute(select(Consultation).where(Consultation.id == ci.consultation_id))
    ).scalar_one_or_none()
    if cons is None:
        raise HTTPException(status_code=404, detail="Client not found")

    # Resolve the package + company (super users carry no company_id claim).
    pkg = None
    if ci.package_id:
        pkg = (
            await db.execute(select(Package).where(Package.id == ci.package_id))
        ).scalar_one_or_none()
    effective_cid = company_id
    if effective_cid is None:
        effective_cid = pkg.company_id if pkg and pkg.company_id else None
    if effective_cid is None and cons.branch_id is not None:
        br = (
            await db.execute(select(Branch).where(Branch.id == cons.branch_id))
        ).scalar_one_or_none()
        effective_cid = br.company_id if br else None

    exp_rows = (
        await db.execute(
            select(Expense)
            .where(Expense.consultation_id == cons.id)
            .order_by(Expense.created_at.asc())
        )
    ).scalars().all()

    latest_by_name: dict[str, Expense] = {}
    for e in exp_rows:
        if not is_permit_processing_category(e.category):
            continue
        latest_by_name[(e.category or "").strip()] = e

    items: list[dict] = []
    for code, name in _PERMIT_CATEGORY_ORDER:
        e = latest_by_name.get(name)
        status = None
        if e is not None:
            status = e.status.value if hasattr(e.status, "value") else e.status
        account = await _resolve_expense_account(db, cons.branch_id, name, company_id)
        default_date = await default_permit_expense_date(db, cons.id, name, ci.id)
        expected_amount = None
        if effective_cid is not None:
            expected_amount = await cart_item_expected_amount(db, ci.id, name, effective_cid)
        items.append({
            "category_code": code,
            "category_name": name,
            "account": account,
            "expense_id": e.id if e is not None else None,
            "status": status,
            "amount": float(e.amount) if e is not None else None,
            "expected_amount": expected_amount,
            "expense_date": (
                e.expense_date.astimezone(BUSINESS_TZ).date()
                if e is not None and e.expense_date is not None else None
            ),
            "default_date": default_date,
            "rejection_reason": e.rejection_reason if e is not None else None,
            "approved_by": e.approved_by if e is not None else None,
            "paid_by": e.paid_by if e is not None else None,
            "can_file": e is None or status == "rejected",
            "is_paid": status == "paid",
        })

    effective_total = await _effective_total_for_cart_item(db, ci)
    paid_total = await _paid_for_cart_item(db, ci)
    paid_ratio = float(paid_total / effective_total) if effective_total > 0 else 0.0
    progress = (
        await db.execute(
            select(PermitProgress).where(PermitProgress.cart_item_id == ci.id)
        )
    ).scalar_one_or_none()
    qualifying = paid_ratio >= 0.5 or bool(progress and progress.eligibility_overridden)

    return {
        "cart_item_id": ci.id,
        "consultation_id": cons.id,
        "client_name": _display_name(cons),
        "branch_id": cons.branch_id,
        "package_id": ci.package_id,
        "package_name": pkg.name if pkg else None,
        "paid_ratio": paid_ratio,
        "qualifying": qualifying,
        "items": items,
    }