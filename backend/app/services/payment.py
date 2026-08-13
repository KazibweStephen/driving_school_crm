import secrets
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.cart import CartItem, CartItemStatus
from app.models.company import Branch, BranchTransfer, TransferStatus
from app.models.consultation import Consultation, FollowUp
from app.models.payment import Installment, InstallmentStatus, Payment
from app.models.user import UserRole


def _generate_system_receipt_number() -> str:
    return f"RCP-{uuid.uuid4().hex[:12].upper()}"


async def generate_transaction_id(db: AsyncSession) -> str:
    """Generate a unique 12-digit numeric transaction id (TID) for a payment."""
    for _ in range(10):
        tid = f"{secrets.randbelow(10**12):012d}"
        exists_result = await db.execute(
            select(Payment.id).where(Payment.transaction_id == tid)
        )
        if not exists_result.scalar_one_or_none():
            return tid
    from fastapi import HTTPException
    raise HTTPException(status_code=500, detail="Could not generate a unique transaction id")


async def _recompute_payment_totals(payment: Payment) -> None:
    """Recompute total_paid and balance from installments (in-place)."""
    total_paid = Decimal("0")
    for inst in payment.installments:
        if inst.status == InstallmentStatus.PAID:
            total_paid += inst.paid_amount or inst.amount
        else:
            total_paid += inst.paid_amount or Decimal("0")
    payment.total_paid = total_paid
    payment.balance = max(Decimal("0"), payment.total_amount - total_paid)


async def create_payment(
    db: AsyncSession,
    consultation_id: uuid.UUID,
    product_id: str,
    package_id: str | None,
    total_amount: Decimal,
    notes: str | None,
    installments_data: list[dict],
    receipt_number: str | None = None,
    created_by_phone: str | None = None,
    document_date: date | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
    branch_id: uuid.UUID | None = None,
) -> Payment:
    if company_id is not None:
        c_result = await db.execute(
            select(Consultation).join(Branch, Consultation.branch_id == Branch.id).where(
                Consultation.id == consultation_id,
                Branch.company_id == company_id,
            )
        )
        if not c_result.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Consultation not found")
    if branch_id is not None:
        b_result = await db.execute(
            select(Branch).where(Branch.id == branch_id)
        )
        branch = b_result.scalar_one_or_none()
        if branch is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Branch not found")
        if company_id is not None and branch.company_id != company_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Branch not in your company")
    if document_date is not None:
        c_row = await db.execute(
            select(Consultation.document_date).where(Consultation.id == consultation_id)
        )
        c_doc = c_row.scalar_one_or_none()
        if c_doc is not None and document_date < c_doc:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="Transaction Date cannot be before Document Date",
            )
    payment = Payment(
        id=uuid.uuid4(),
        consultation_id=consultation_id,
        branch_id=branch_id,
        created_by_phone=created_by_phone,
        product_id=product_id,
        package_id=package_id,
        total_amount=total_amount,
        document_date=document_date,
        notes=notes,
        receipt_number=receipt_number or None,
        system_receipt_number=_generate_system_receipt_number(),
        transaction_id=await generate_transaction_id(db),
    )
    payment_id = payment.id
    db.add(payment)
    await db.flush()

    for inst_data in installments_data:
        create_inst = Installment(
            payment_id=payment_id,
            due_date=inst_data["due_date"],
            amount=inst_data["amount"],
        )
        db.add(create_inst)
    await db.flush()

    # Reload with installments to compute totals
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.installments))
    )
    payment = result.scalar_one()
    await _recompute_payment_totals(payment)

    return payment


async def get_payment_by_receipt(db: AsyncSession, receipt_number: str) -> Payment | None:
    result = await db.execute(
        select(Payment).where(Payment.receipt_number == receipt_number)
    )
    return result.scalars().first()


async def get_payments_by_consultation(
    db: AsyncSession, consultation_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[Payment]:
    if company_id is not None:
        # A consultation with no branch is not tied to any company; allow access
        # so payments remain reachable from the onboarding receipt step.
        c_result = await db.execute(
            select(Consultation)
            .outerjoin(Branch, Consultation.branch_id == Branch.id)
            .where(
                Consultation.id == consultation_id,
                or_(
                    Consultation.branch_id.is_(None),
                    Branch.company_id == company_id,
                ),
            )
        )
        if not c_result.scalar_one_or_none():
            return []
    result = await db.execute(
        select(Payment)
        .where(Payment.consultation_id == consultation_id)
        .options(selectinload(Payment.installments))
        .order_by(Payment.created_at.desc())
    )
    return list(result.scalars().all())


async def list_payments(
    db: AsyncSession,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    client_type: str | None = "all",
    branch_ids: list[uuid.UUID] | None = None,
    company_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Payment], int, Decimal, Decimal, Decimal]:
    from app.models.company import Branch
    from app.models.product import Product

    base_query = select(Payment).join(Consultation, Payment.consultation_id == Consultation.id)
    count_query = select(func.count(Payment.id)).join(Consultation, Payment.consultation_id == Consultation.id)
    totals_query = select(
        func.coalesce(func.sum(Payment.total_amount), 0),
        func.coalesce(func.sum(Payment.total_paid), 0),
        func.coalesce(func.sum(Payment.balance), 0),
    ).join(Consultation, Payment.consultation_id == Consultation.id)

    # Build prior-payments subquery for client_type filter
    p2 = aliased(Payment)
    has_prior = exists(
        select(p2.id).where(
            and_(
                p2.consultation_id == Payment.consultation_id,
                p2.created_at < Payment.created_at,
                p2.id != Payment.id,
            )
        )
    )

    filters: list = []

    if company_id is not None:
        base_query = base_query.join(Branch, Consultation.branch_id == Branch.id)
        count_query = count_query.join(Branch, Consultation.branch_id == Branch.id)
        totals_query = totals_query.join(Branch, Consultation.branch_id == Branch.id)
        filters.append(Branch.company_id == company_id)

    if search:
        search_filter = or_(
            Consultation.first_name.ilike(f"%{search}%"),
            Consultation.middle_name.ilike(f"%{search}%"),
            Consultation.last_name.ilike(f"%{search}%"),
            Consultation.phone.ilike(f"%{search}%"),
            Payment.receipt_number.ilike(f"%{search}%"),
            Payment.system_receipt_number.ilike(f"%{search}%"),
            Payment.transaction_id.ilike(f"%{search}%"),
        )
        filters.append(search_filter)

    if date_from:
        filters.append(Payment.document_date >= date_from)

    if date_to:
        filters.append(Payment.document_date <= date_to)

    if branch_ids:
        filters.append(or_(
            Consultation.branch_id.in_(branch_ids),
            Payment.branch_id.in_(branch_ids),
        ))

    if client_type == "new":
        filters.append(~has_prior)
    elif client_type == "collection":
        filters.append(has_prior)

    for f in filters:
        base_query = base_query.where(f)
        count_query = count_query.where(f)
        totals_query = totals_query.where(f)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    totals_result = await db.execute(totals_query)
    total_amount_sum, total_paid_sum, total_balance_sum = totals_result.one()

    query = (
        base_query
        .options(
            selectinload(Payment.installments),
            selectinload(Payment.consultation),
            selectinload(Payment.created_by_user),
        )
        .order_by(func.coalesce(Payment.document_date, Payment.created_at.cast(Date)).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    payments = list(result.scalars().all())

    return payments, total, total_amount_sum, total_paid_sum, total_balance_sum


async def mark_installment_paid(
    db: AsyncSession,
    installment_id: uuid.UUID,
    paid_date: date | None,
    paid_amount: Decimal | None,
    notes: str | None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
    push_forward_date: date | None = None,
    future_installments: list[dict] | None = None,
) -> Installment | None:
    from fastapi import HTTPException

    result = await db.execute(
        select(Installment).where(Installment.id == installment_id)
    )
    inst = result.scalar_one_or_none()
    if not inst:
        return None
    if company_id is not None:
        p_result = await db.execute(
            select(Payment).join(Consultation, Payment.consultation_id == Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(Payment.id == inst.payment_id, Branch.company_id == company_id)
        )
        if not p_result.scalar_one_or_none():
            return None
    if inst.status == InstallmentStatus.PAID:
        raise HTTPException(status_code=400, detail="Installment already paid")
    if inst.status == InstallmentStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Installment is cancelled")

    now = date.today()
    paid_amount = paid_amount if paid_amount is not None else inst.amount
    if paid_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    payment_id = inst.payment_id

    # Load the parent payment (with installments) to drive cascade + recompute
    pay_result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.installments), selectinload(Payment.consultation))
    )
    payment = pay_result.scalar_one()
    touched_ids: set[uuid.UUID] = {payment.id}

    effective_paid_date = paid_date or now
    if (
        payment.consultation is not None
        and payment.consultation.document_date is not None
        and effective_paid_date < payment.consultation.document_date
    ):
        raise HTTPException(
            status_code=400,
            detail="Transaction Date cannot be before Document Date",
        )

    # Apply the collection across pending installments of THIS payment in
    # due-date order. The first pending installment (the one this payment is
    # applied to) absorbs the collection record when it is fully settled — its
    # paid_amount carries the collected value so the receipt can reconstruct the
    # per-collection history. Partial settlements leave it PENDING and create a
    # dedicated PAID collection installment. Excess beyond the first installments
    # cascades into the remaining ones, reducing them in place.
    pending_installments = sorted(
        [i for i in payment.installments if i.status == InstallmentStatus.PENDING],
        key=lambda i: (i.due_date, i.created_at),
    )

    remaining = paid_amount
    collection_inst: Installment | None = None
    for index, target in enumerate(pending_installments):
        if remaining <= 0:
            break
        if index == 0:
            if remaining >= target.amount:
                target.paid_amount = paid_amount
                remaining -= target.amount
                target.amount = Decimal("0")
                target.status = InstallmentStatus.PAID
                target.paid_date = paid_date or now
                if notes is not None:
                    target.notes = notes
            else:
                target.amount = max(Decimal("0"), target.amount - remaining)
                remaining = Decimal("0")
                if notes is not None:
                    target.notes = notes
                collection_inst = Installment(
                    payment_id=payment_id,
                    due_date=paid_date or now,
                    amount=paid_amount,
                    paid_amount=paid_amount,
                    status=InstallmentStatus.PAID,
                    paid_date=paid_date or now,
                    notes=notes or "Payment collected",
                )
        else:
            if remaining >= target.amount:
                remaining -= target.amount
                target.amount = Decimal("0")
                target.status = InstallmentStatus.PAID
                target.paid_date = paid_date or now
                if notes is not None:
                    target.notes = notes
            else:
                target.amount = max(Decimal("0"), target.amount - remaining)
                remaining = Decimal("0")
                if notes is not None:
                    target.notes = notes

    if collection_inst is not None:
        db.add(collection_inst)

    # Apply due-date overrides for remaining future installments of this payment.
    if future_installments:
        for adj in future_installments:
            adj_id = adj.get("installment_id")
            adj_date = adj.get("due_date")
            if not adj_id or not adj_date:
                continue
            a_result = await db.execute(
                select(Installment).where(
                    Installment.id == adj_id,
                    Installment.payment_id == payment_id,
                )
            )
            adj_inst = a_result.scalar_one_or_none()
            if adj_inst and adj_inst.status != InstallmentStatus.PAID:
                adj_inst.due_date = adj_date
                touched_ids.add(adj_inst.payment_id)

    await db.flush()

    # Recompute totals for every touched payment. Use populate_existing so the
    # selectinload re-fetches installments even though the Payment object is
    # already in the identity map — otherwise the freshly added collection
    # installment is missing and total_paid/balance are computed too low.
    paid_payment = None
    for pid in touched_ids:
        reloaded = await db.execute(
            select(Payment)
            .where(Payment.id == pid)
            .options(selectinload(Payment.installments), selectinload(Payment.consultation))
            .execution_options(populate_existing=True)
        )
        pay = reloaded.scalar_one()
        await _recompute_payment_totals(pay)
        if pid == payment_id:
            paid_payment = pay
    await db.flush()

    # Auto-create/update a cross-branch transfer for branch reconciliation
    await _sync_branch_transfer_for_payment(db, paid_payment)

    await db.refresh(inst)
    return inst


async def _sync_branch_transfer_for_payment(
    db: AsyncSession,
    payment: Payment,
) -> BranchTransfer | None:
    """When a payment is collected at a branch different from the client's
    onboarded branch, keep an initiated transfer in sync for reconciliation."""
    if payment.total_paid <= 0 or payment.branch_id is None:
        return None
    consultation = payment.consultation
    if consultation is None or consultation.branch_id is None:
        return None
    if consultation.branch_id == payment.branch_id:
        return None

    result = await db.execute(
        select(BranchTransfer).where(
            BranchTransfer.payment_id == payment.id,
            BranchTransfer.status == TransferStatus.INITIATED,
        )
    )
    existing = result.scalars().first()

    from_branch = await db.get(Branch, payment.branch_id)
    to_branch = await db.get(Branch, consultation.branch_id)
    from_name = from_branch.name if from_branch else "branch"
    to_name = to_branch.name if to_branch else "branch"
    reason = (
        f"Payment collected at {from_name} for client onboarded at {to_name} "
        f"(receipt {payment.receipt_number or payment.system_receipt_number})"
    )

    if existing is not None:
        existing.amount = float(payment.total_paid)
        existing.reason = reason
        await db.flush()
        return existing

    transfer = BranchTransfer(
        from_branch_id=payment.branch_id,
        to_branch_id=consultation.branch_id,
        amount=float(payment.total_paid),
        reason=reason,
        consultation_id=payment.consultation_id,
        payment_id=payment.id,
        initiated_by=payment.created_by_phone,
    )
    db.add(transfer)
    await db.flush()
    return transfer


async def list_clients(
    db: AsyncSession,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
    outstanding_only: bool = False,
) -> tuple[list[Consultation], int]:
    # Clients are consultations with at least one converted_paid or converted_paying cart item
    active_statuses = [CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING]

    subq = (
        select(CartItem.consultation_id)
        .where(CartItem.status.in_(active_statuses))
        .distinct()
        .subquery()
    )

    query = select(Consultation).where(Consultation.id.in_(select(subq))).options(
        selectinload(Consultation.cart_items),
        selectinload(Consultation.follow_ups),
    )

    if outstanding_only:
        query = query.where(
            exists(
                select(Payment.id).where(
                    Payment.consultation_id == Consultation.id,
                    Payment.balance > 0,
                )
            )
        )

    if company_id is not None:
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)

    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.where(
            or_(
                Consultation.phone.ilike(search_term),
                Consultation.first_name.ilike(search_term),
                Consultation.middle_name.ilike(search_term),
                Consultation.last_name.ilike(search_term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Consultation.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_client_detail(
    db: AsyncSession,
    consultation_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Consultation | None:
    query = (
        select(Consultation)
        .where(Consultation.id == consultation_id)
        .options(
            selectinload(Consultation.cart_items),
            selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
        )
    )
    if company_id is not None:
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()
