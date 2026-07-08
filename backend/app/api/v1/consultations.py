import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.cart import CartItem, CartItemStatus
from app.models.consultation import ConsultationStatus, FollowUp, FollowUpStatus, FollowUpType
from app.models.consultation import InterestLevel
from app.models.payment import Installment, InstallmentStatus, Payment
from app.models.user import User
from app.schemas.consultation import (
    ClientInfo,
    ConsultationCreate,
    ConsultationListResponse,
    ConsultationRead,
    ConsultationUpdate,
    FollowUpCreate,
    FollowUpRead,
    FollowUpUpdate,
    FullConsultationCreate,
)
from app.services import consultation as consultation_service
from app.services import payment as payment_service

router = APIRouter(prefix="/consultations", tags=["consultations"])


def _phone_matches(search: str, consultation) -> bool:
    return search and consultation.phone == search


@router.post("/", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
async def create_consultation(
    data: ConsultationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    consultation = await consultation_service.create_consultation(
        db,
        phone=data.phone,
        first_name=data.first_name,
        middle_name=data.middle_name,
        last_name=data.last_name,
        location=data.location,
        how_they_knew_us=data.how_they_knew_us,
        interest_level=data.interest_level,
        interested_products=(
            [p.model_dump() for p in data.interested_products]
            if data.interested_products
            else None
        ),
        start_date=data.start_date,
        notes=data.notes,
        branch_id=data.branch_id,
        created_by_phone=current_user.phone,
    )
    return ConsultationRead.from_orm_with_cart(consultation)


@router.post("/full", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
async def create_full_consultation(
    data: FullConsultationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a consultation with products and optional payment in a single transaction."""
    # Create consultation
    consultation = await consultation_service.create_consultation(
        db,
        phone=data.phone,
        first_name=data.first_name,
        middle_name=data.middle_name,
        last_name=data.last_name,
        location=data.location,
        how_they_knew_us=data.how_they_knew_us,
        interest_level=data.interest_level,
        start_date=data.start_date,
        notes=data.notes,
        branch_id=data.branch_id,
        created_by_phone=current_user.phone,
    )

    # Create cart items and payments
    from app.services.cart import add_cart_item, update_cart_item

    receipt_number = data.payment.receipt_number if data.payment else None
    transaction_id = payment_service._generate_system_receipt_number()

    cart_item_map = {}
    for item_data in data.items:
        ci = await add_cart_item(
            db,
            consultation_id=consultation.id,
            product_id=item_data.product_id,
            package_id=item_data.package_id,
            notes=None,
        )
        cart_item_map[item_data.product_id + (item_data.package_id or '')] = (ci, item_data.allocation)

    # Process payments if provided
    if data.payment and data.items:
        from app.models.product import Package

        for item_data in data.items:
            if item_data.allocation <= 0:
                continue

            key = item_data.product_id + (item_data.package_id or '')
            ci, allocation = cart_item_map[key]
            allocation = Decimal(str(allocation))

            # Get package price to determine status
            package_price = allocation  # Default to allocation if no package
            if item_data.package_id:
                pkg = await db.get(Package, item_data.package_id)
                if pkg:
                    package_price = Decimal(str(pkg.price))

            remaining = max(Decimal('0'), package_price - allocation)
            is_fully_paid = remaining == 0
            cart_status = 'converted_paid' if is_fully_paid else 'converted_paying'

            payment = Payment(
                consultation_id=consultation.id,
                product_id=item_data.product_id,
                package_id=item_data.package_id,
                total_amount=package_price,
                notes=f"Paid: {allocation}, Balance: {remaining}",
                receipt_number=receipt_number,
                system_receipt_number=transaction_id,
            )
            db.add(payment)
            await db.flush()

            # Create paid installment for today's payment
            paid_inst = Installment(
                payment_id=payment.id,
                due_date=date.today(),
                amount=allocation,
                status=InstallmentStatus.PAID,
                paid_date=date.today(),
                paid_amount=allocation,
                notes='Initial payment',
            )
            db.add(paid_inst)

            # Create future installments from item data
            if item_data.installments:
                for fi in item_data.installments:
                    fi_inst = Installment(
                        payment_id=payment.id,
                        due_date=fi.due_date,
                        amount=fi.amount,
                        status=InstallmentStatus.PENDING,
                    )
                    db.add(fi_inst)

            # Recompute payment totals
            await db.refresh(payment, ["installments"])
            await payment_service._recompute_payment_totals(payment)
            await db.flush()
            await update_cart_item(db, ci.id, status=cart_status, notes=None)

    # Reload with relationships
    from app.models.consultation import Consultation
    result = await db.execute(
        select(Consultation)
        .where(Consultation.id == consultation.id)
        .options(
            selectinload(Consultation.follow_ups)
            .selectinload(FollowUp.cart_items),
            selectinload(Consultation.cart_items),
        )
    )
    consultation = result.scalar_one()

    return ConsultationRead.from_orm_with_cart(consultation)


@router.get("/", response_model=ConsultationListResponse)
async def list_consultations(
    search: str | None = Query(None, max_length=50),
    status: ConsultationStatus | None = None,
    stage: str | None = Query(None, pattern=r"^(consulting|active|completed|lost)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    branch_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    consultations, total = await consultation_service.search_consultations(
        db, search=search, status=status, page=page, page_size=page_size, stage=stage,
        branch_id=branch_id,
    )
    return ConsultationListResponse(
        consultations=[ConsultationRead.from_orm_with_cart(c) for c in consultations],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/client-search", response_model=list[ClientInfo])
async def client_search(
    search: str = Query(..., min_length=1, max_length=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deduplicated search — returns one result per phone number across all branches."""
    clients = await consultation_service.client_search(db, search)
    result = []
    for c in clients:
        result.append(
            ClientInfo(
                phone=c.phone,
                first_name=c.first_name,
                middle_name=c.middle_name,
                last_name=c.last_name,
                location=c.location,
                how_they_knew_us=c.how_they_knew_us,
                interest_level=c.interest_level,
                latest_status=c.status,
                latest_consultation_id=c.id,
            )
        )
    return result


@router.get("/{consultation_id}", response_model=ConsultationRead)
async def get_consultation(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    try:
        cid = UUID(consultation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID"
        )
    consultation = await consultation_service.get_consultation_by_id(db, cid)
    if consultation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    return ConsultationRead.from_orm_with_cart(consultation)


@router.patch("/{consultation_id}", response_model=ConsultationRead)
async def update_consultation(
    consultation_id: str,
    data: ConsultationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    try:
        cid = UUID(consultation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID"
        )
    consultation = await consultation_service.get_consultation_by_id(db, cid)
    if consultation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    updated = await consultation_service.update_consultation(
        db,
        consultation,
        phone=data.phone,
        first_name=data.first_name,
        middle_name=data.middle_name,
        last_name=data.last_name,
        location=data.location,
        how_they_knew_us=data.how_they_knew_us,
        interest_level=data.interest_level,
        interested_products=(
            [p.model_dump() for p in data.interested_products]
            if data.interested_products is not None
            else None
        ),
        start_date=data.start_date,
        notes=data.notes,
        status=data.status,
    )
    return ConsultationRead.from_orm_with_cart(updated)


@router.delete("/{consultation_id}", response_model=ConsultationRead)
async def deactivate_consultation(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    try:
        cid = UUID(consultation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID"
        )
    consultation = await consultation_service.get_consultation_by_id(db, cid)
    if consultation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    if consultation.status in (
        ConsultationStatus.LOST,
        ConsultationStatus.CONVERTED_COMPLETED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Consultation is already finished",
        )
    updated = await consultation_service.deactivate_consultation(db, consultation)
    return ConsultationRead.from_orm_with_cart(updated)


@router.post(
    "/{consultation_id}/follow-ups",
    response_model=FollowUpRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_follow_up(
    consultation_id: str,
    data: FollowUpCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    try:
        cid = UUID(consultation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID"
        )
    consultation = await consultation_service.get_consultation_by_id(db, cid)
    if consultation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    fu = await consultation_service.create_follow_up(
        db,
        consultation_id=cid,
        follow_up_date=data.follow_up_date,
        note=data.note,
        fu_type=data.type,
        cart_item_ids=data.cart_item_ids,
    )
    fu_with_cart = await consultation_service.get_follow_up_by_id(db, fu.id)
    return FollowUpRead.from_orm_with_cart(fu_with_cart or fu)


@router.patch("/follow-ups/{follow_up_id}", response_model=FollowUpRead)
async def update_follow_up(
    follow_up_id: str,
    data: FollowUpUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    try:
        fid = UUID(follow_up_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID"
        )
    fu = await consultation_service.get_follow_up_by_id(db, fid)
    if fu is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found"
        )
    updated = await consultation_service.update_follow_up(
        db, fu, follow_up_date=data.follow_up_date, note=data.note, status=data.status,
        fu_type=data.type, cart_item_ids=data.cart_item_ids,
    )
    updated_with_cart = await consultation_service.get_follow_up_by_id(db, updated.id)
    return FollowUpRead.from_orm_with_cart(updated_with_cart or updated)


@router.delete("/follow-ups/{follow_up_id}", response_model=FollowUpRead)
async def deactivate_follow_up(
    follow_up_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    try:
        fid = UUID(follow_up_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID"
        )
    fu = await consultation_service.get_follow_up_by_id(db, fid)
    if fu is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found"
        )
    if fu.status == FollowUpStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Follow-up is already cancelled",
        )
    updated = await consultation_service.deactivate_follow_up(db, fu)
    return FollowUpRead.model_validate(updated)
