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
        db, search=search, page=page, page_size=page_size
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

        payments = await payment_service.get_payments_by_consultation(db, c.id)
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

    consultation = await payment_service.get_client_detail(db, cid)
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

    payment = await payment_service.create_payment(
        db,
        consultation_id=cid,
        product_id=data.product_id,
        package_id=data.package_id,
        total_amount=data.total_amount,
        notes=data.notes,
        installments_data=[i.model_dump() for i in installments],
        receipt_number=data.receipt_number,
    )
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

    payments = await payment_service.get_payments_by_consultation(db, cid)
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
    )
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")
    return InstallmentRead.model_validate(inst)
