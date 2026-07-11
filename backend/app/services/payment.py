import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.cart import CartItem, CartItemStatus
from app.models.company import Branch
from app.models.consultation import Consultation, FollowUp
from app.models.payment import Installment, InstallmentStatus, Payment
from app.models.user import UserRole


def _generate_system_receipt_number() -> str:
    return f"RCP-{uuid.uuid4().hex[:12].upper()}"


async def _recompute_payment_totals(payment: Payment) -> None:
    """Recompute total_paid and balance from installments (in-place)."""
    total_paid = Decimal("0")
    for inst in payment.installments:
        if inst.status == InstallmentStatus.PAID:
            total_paid += inst.paid_amount or inst.amount
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
) -> Payment:
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        c_result = await db.execute(
            select(Consultation).join(Branch, Consultation.branch_id == Branch.id).where(
                Consultation.id == consultation_id,
                Branch.company_id == company_id,
            )
        )
        if not c_result.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Consultation not found")
    payment = Payment(
        consultation_id=consultation_id,
        created_by_phone=created_by_phone,
        product_id=product_id,
        package_id=package_id,
        total_amount=total_amount,
        document_date=document_date,
        notes=notes,
        receipt_number=receipt_number or None,
        system_receipt_number=_generate_system_receipt_number(),
    )
    db.add(payment)
    await db.flush()

    for inst_data in installments_data:
        create_inst = Installment(
            payment_id=payment.id,
            due_date=inst_data["due_date"],
            amount=inst_data["amount"],
        )
        db.add(create_inst)
    await db.flush()

    # Reload with installments to compute totals
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment.id)
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
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        c_result = await db.execute(
            select(Consultation).join(Branch, Consultation.branch_id == Branch.id).where(
                Consultation.id == consultation_id,
                Branch.company_id == company_id,
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
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Payment], int, Decimal, Decimal, Decimal]:
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

    if search:
        search_filter = or_(
            Consultation.first_name.ilike(f"%{search}%"),
            Consultation.middle_name.ilike(f"%{search}%"),
            Consultation.last_name.ilike(f"%{search}%"),
            Consultation.phone.ilike(f"%{search}%"),
            Payment.receipt_number.ilike(f"%{search}%"),
            Payment.system_receipt_number.ilike(f"%{search}%"),
        )
        filters.append(search_filter)

    if date_from:
        filters.append(Payment.document_date >= date_from)

    if date_to:
        filters.append(Payment.document_date <= date_to)

    if branch_ids:
        filters.append(Consultation.branch_id.in_(branch_ids))

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
) -> Installment | None:
    result = await db.execute(
        select(Installment).where(Installment.id == installment_id)
    )
    inst = result.scalar_one_or_none()
    if not inst:
        return None
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        p_result = await db.execute(
            select(Payment).join(Consultation, Payment.consultation_id == Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(Payment.id == inst.payment_id, Branch.company_id == company_id)
        )
        if not p_result.scalar_one_or_none():
            return None

    now = date.today()
    inst.status = InstallmentStatus.PAID
    inst.paid_date = paid_date or now
    inst.paid_amount = paid_amount or inst.amount
    if notes is not None:
        inst.notes = notes
    await db.flush()

    # Recompute parent payment totals
    result = await db.execute(
        select(Payment)
        .where(Payment.id == inst.payment_id)
        .options(selectinload(Payment.installments))
    )
    payment = result.scalar_one()
    await _recompute_payment_totals(payment)
    await db.flush()
    await db.refresh(inst)
    return inst


async def list_clients(
    db: AsyncSession,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
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

    if current_user_role != UserRole.SUPER_USER and company_id is not None:
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
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()
