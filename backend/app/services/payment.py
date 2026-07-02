import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem, CartItemStatus
from app.models.consultation import Consultation, FollowUp
from app.models.payment import Installment, InstallmentStatus, Payment


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
) -> Payment:
    # Validate receipt_number uniqueness if provided
    if receipt_number:
        existing = await db.execute(
            select(Payment).where(Payment.receipt_number == receipt_number)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(
                status_code=409,
                detail=f"Receipt number '{receipt_number}' already exists",
            )

    payment = Payment(
        consultation_id=consultation_id,
        product_id=product_id,
        package_id=package_id,
        total_amount=total_amount,
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
    await db.flush()

    return payment


async def get_payment_by_receipt(db: AsyncSession, receipt_number: str) -> Payment | None:
    result = await db.execute(
        select(Payment).where(Payment.receipt_number == receipt_number)
    )
    return result.scalar_one_or_none()


async def get_payments_by_consultation(
    db: AsyncSession, consultation_id: uuid.UUID
) -> list[Payment]:
    result = await db.execute(
        select(Payment)
        .where(Payment.consultation_id == consultation_id)
        .options(selectinload(Payment.installments))
        .order_by(Payment.created_at.desc())
    )
    return list(result.scalars().all())


async def mark_installment_paid(
    db: AsyncSession,
    installment_id: uuid.UUID,
    paid_date: date | None,
    paid_amount: Decimal | None,
    notes: str | None,
) -> Installment | None:
    result = await db.execute(
        select(Installment).where(Installment.id == installment_id)
    )
    inst = result.scalar_one_or_none()
    if not inst:
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
    db: AsyncSession, consultation_id: uuid.UUID
) -> Consultation | None:
    result = await db.execute(
        select(Consultation)
        .where(Consultation.id == consultation_id)
        .options(
            selectinload(Consultation.cart_items),
            selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
        )
    )
    return result.scalar_one_or_none()
