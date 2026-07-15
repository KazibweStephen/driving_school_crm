import logging
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.cart import CartItem, CartItemStatus
from app.models.consultation import Consultation
from app.models.user import User
from app.schemas.payment import (
    ClientListResponse,
    ClientSummary,
    InstallmentCreate,
    InstallmentRead,
    InstallmentUpdate,
    PaymentCreate,
    PaymentRead,
)
from app.services import payment as payment_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["clients"])


@router.get("/api/v1/clients/", response_model=ClientListResponse)
async def list_clients(
    search: str | None = Query(None, max_length=50),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    consultations, total = await payment_service.list_clients(
        db, search=search, page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    clients = []
    for c in consultations:
        # Count paid/paying products only
        active_count = sum(
            1 for ci in (c.cart_items or [])
            if ci.status in (CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING)
        )
        upgradable_count = sum(
            1 for ci in (c.cart_items or [])
            if ci.status == CartItemStatus.CONVERTED_PAYING
        )

        payments = await payment_service.get_payments_by_consultation(db, c.id, company_id=current_user.company_id, current_user_role=current_user.role)
        total_paid = Decimal("0.00")
        last_payment_date = None
        for pay in payments:
            for inst in pay.installments:
                if inst.status.value == "paid":
                    amt = inst.paid_amount or inst.amount
                    total_paid += amt
                    if last_payment_date is None or (inst.paid_date and inst.paid_date > last_payment_date):
                        last_payment_date = inst.paid_date

        clients.append(ClientSummary(
            id=c.id,
            phone=c.phone,
            first_name=c.first_name,
            middle_name=c.middle_name,
            last_name=c.last_name,
            location=c.location,
            interest_level=c.interest_level.value if c.interest_level else None,
            active_products_count=active_count,
            upgradable_products_count=upgradable_count,
            total_paid=total_paid,
            last_payment_date=last_payment_date,
            created_at=c.created_at,
        ))
    return ClientListResponse(
        clients=clients,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/api/v1/clients/{consultation_id}")
async def get_client(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    consultation = await payment_service.get_client_detail(db, cid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not consultation:
        raise HTTPException(status_code=404, detail="Client not found")

    # Verify at least one paid/paying cart item
    has_paid = any(
        ci.status in (CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING)
        for ci in (consultation.cart_items or [])
    )
    if not has_paid:
        raise HTTPException(status_code=400, detail="This consultation has no paid products")

    from app.schemas.consultation import ConsultationRead
    return ConsultationRead.from_orm_with_cart(consultation)


@router.post(
    "/api/v1/consultations/{consultation_id}/payments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    consultation_id: str,
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    installments = data.installments or [
        InstallmentCreate(due_date=date.today(), amount=data.total_amount)
    ]

    from datetime import date as date_type
    payment = await payment_service.create_payment(
        db,
        consultation_id=cid,
        product_id=data.product_id,
        package_id=data.package_id,
        total_amount=data.total_amount,
        document_date=data.document_date or date_type.today(),
        notes=data.notes,
        installments_data=[i.model_dump() for i in installments],
        receipt_number=data.receipt_number,
        created_by_phone=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )

    # Send payment received SMS
    if current_user.company_id:
        try:
            from app.services.notification.service import on_payment_received
            from sqlalchemy import select as sa_select
            consult_result = await db.execute(
                sa_select(Consultation).where(Consultation.id == cid)
            )
            consultation = consult_result.scalar_one_or_none()
            if consultation and consultation.phone:
                client_name = " ".join(
                    filter(None, [consultation.first_name, consultation.middle_name, consultation.last_name])
                ) or "Client"
                receipt = data.receipt_number or ""
                await on_payment_received(
                    db, current_user.company_id, consultation.phone, client_name,
                    str(data.total_amount), receipt,
                )
        except Exception as e:
            logger.warning("[SMS] Failed to send payment_received notification: %s", e)

    return PaymentRead.model_validate(payment)


@router.get(
    "/api/v1/consultations/{consultation_id}/payments",
    response_model=list[PaymentRead],
)
async def list_payments(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    payments = await payment_service.get_payments_by_consultation(db, cid, company_id=current_user.company_id, current_user_role=current_user.role)
    return [PaymentRead.model_validate(p) for p in payments]


@router.patch("/api/v1/payments/{payment_id}/installments/{installment_id}", response_model=InstallmentRead)
async def update_installment(
    payment_id: str,
    installment_id: str,
    data: InstallmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(installment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    inst = await payment_service.mark_installment_paid(
        db,
        installment_id=iid,
        paid_date=data.paid_date,
        paid_amount=data.paid_amount,
        notes=data.notes,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")

    # Send payment received SMS on installment payment
    if current_user.company_id:
        try:
            from app.services.notification.service import on_payment_received
            from sqlalchemy import select as sa_select
            from app.models.payment import Payment as PaymentModel
            pay_result = await db.execute(
                sa_select(PaymentModel).where(PaymentModel.id == inst.payment_id)
            )
            payment = pay_result.scalar_one_or_none()
            if payment:
                consult_result = await db.execute(
                    sa_select(Consultation).where(Consultation.id == payment.consultation_id)
                )
                consultation = consult_result.scalar_one_or_none()
                if consultation and consultation.phone:
                    client_name = " ".join(
                        filter(None, [consultation.first_name, consultation.middle_name, consultation.last_name])
                    ) or "Client"
                    paid_amount = str(data.paid_amount or inst.amount)
                    receipt = payment.receipt_number or ""
                    await on_payment_received(
                        db, current_user.company_id, consultation.phone, client_name,
                        paid_amount, receipt,
                    )
        except Exception as e:
            logger.warning("[SMS] Failed to send payment_received notification: %s", e)

    return InstallmentRead.model_validate(inst)
