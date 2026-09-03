import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.cart import CartItem, CartItemStatus
from app.models.commission import Commission
from app.models.consultation import Consultation
from app.models.product import Package, Product
from app.models.user import User
from app.utils.tenant import resolve_branch_ids
from app.schemas.payment import (
    ClientActiveProduct,
    ClientListResponse,
    ClientSummary,
    CollectionPaymentCreate,
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
    outstanding_only: bool = Query(default=False),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs; auto-resolved if omitted"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("consultations.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = await resolve_branch_ids(db, current_user, requested)

    consultations, total = await payment_service.list_clients(
        db, search=search, page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
        outstanding_only=outstanding_only, branch_ids=resolved_branch_ids,
    )

    active_statuses = [CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING]

    # Batch-resolve product/package names + commissions for all active cart items on this page
    all_items = [
        ci for c in consultations
        for ci in (c.cart_items or [])
        if ci.status in active_statuses
    ]
    products_map: dict[str, Product] = {}
    packages_map: dict[str, Package] = {}
    commissions_map: dict[str, Commission] = {}
    product_ids = {ci.product_id for ci in all_items}
    package_ids = {ci.package_id for ci in all_items if ci.package_id}
    if product_ids:
        res = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        products_map = {str(p.id): p for p in res.scalars().all()}
    if package_ids:
        res = await db.execute(select(Package).where(Package.id.in_(package_ids)))
        packages_map = {str(p.id): p for p in res.scalars().all()}
    if all_items:
        res = await db.execute(
            select(Commission).where(
                Commission.cart_item_id.in_([ci.id for ci in all_items])
            )
        )
        commissions_map = {str(cm.cart_item_id): cm for cm in res.scalars().all()}

    clients = []
    for c in consultations:
        # Count paid/paying products only
        active_count = sum(
            1 for ci in (c.cart_items or [])
            if ci.status in active_statuses
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

        products: list[ClientActiveProduct] = []
        for ci in (c.cart_items or []):
            if ci.status not in active_statuses:
                continue
            pays = [
                p for p in payments
                if p.product_id == ci.product_id
                and p.package_id == ci.package_id
            ]
            sorted_pays = sorted(pays, key=lambda p: p.created_at)
            item_total = sorted_pays[0].total_amount if sorted_pays else Decimal("0.00")
            paid = sum((p.total_paid or Decimal("0.00")) for p in pays)
            balance = max(Decimal("0.00"), item_total - paid)
            commission = commissions_map.get(str(ci.id))
            commission_total = Decimal("0.00")
            if commission:
                if commission.converter_id == current_user.phone:
                    commission_total = commission.converter_amount
                elif commission.primary_recommender_id == current_user.phone:
                    commission_total = commission.primary_recommender_amount
                elif commission.secondary_recommender_id == current_user.phone:
                    commission_total = commission.secondary_recommender_amount
                else:
                    commission_total = Decimal("0.00")
            commission_earned = Decimal("0.00")
            if commission_total and item_total > 0:
                ratio = min(Decimal("1.00"), paid / item_total)
                commission_earned = (commission_total * ratio).quantize(Decimal("0.01"))

            product_obj = products_map.get(ci.product_id)
            package_obj = packages_map.get(ci.package_id) if ci.package_id else None
            products.append(ClientActiveProduct(
                cart_item_id=ci.id,
                product_id=ci.product_id,
                product_name=product_obj.name if product_obj else "",
                package_id=ci.package_id,
                package_name=package_obj.name if package_obj else None,
                status=ci.status.value,
                total=item_total,
                paid=paid,
                balance=balance,
                commission_earned=commission_earned,
                commission_total=commission_total,
            ))

        active_dates = [
            ci.created_at for ci in (c.cart_items or [])
            if ci.status in active_statuses and ci.created_at
        ]
        active_started = min(active_dates) if active_dates else c.created_at
        active_for_days = 0
        if active_started:
            active_for_days = max(0, (datetime.now(timezone.utc) - active_started).days)

        clients.append(ClientSummary(
            id=c.id,
            phone=c.phone,
            first_name=c.first_name,
            middle_name=c.middle_name,
            last_name=c.last_name,
            location=c.location,
            interest_level=c.interest_level.value if c.interest_level else None,
            branch_name=c.branch.name if c.branch else None,
            active_products_count=active_count,
            upgradable_products_count=upgradable_count,
            total_paid=total_paid,
            last_payment_date=last_payment_date,
            active_for_days=active_for_days,
            created_at=c.created_at,
            products=products,
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
    current_user: User = Depends(require_permission("consultations.view")),
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
    current_user: User = Depends(require_permission("payments.record")),
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
        branch_id=data.branch_id,
    )

    # Serialize immediately to avoid lazy-load issues after subsequent db queries
    from app.schemas.payment import PaymentRead, InstallmentRead
    payment_response = PaymentRead.model_validate(payment)

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

    return payment_response


@router.post(
    "/api/v1/consultations/{consultation_id}/payments/collect",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
async def collect_payment(
    consultation_id: str,
    data: CollectionPaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("payments.record")),
):
    """Record a collection as an independent Payment row (own receipt numbers,
    transaction id, and payments-list entry) instead of accumulating onto the
    original product schedule row."""
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    payment = await payment_service.create_collection_payment(
        db,
        consultation_id=cid,
        product_id=data.product_id,
        package_id=data.package_id,
        branch_id=data.branch_id,
        created_by_phone=current_user.phone,
        amount=data.amount,
        document_date=data.document_date,
        receipt_number=data.receipt_number,
        notes=data.notes,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
        schedule_adjustments=(
            [a.model_dump() for a in data.schedule_adjustments]
            if data.schedule_adjustments else None
        ),
        future_schedule=(
            [a.model_dump() for a in data.future_schedule]
            if data.future_schedule else None
        ),
    )

    # Serialize immediately to avoid lazy-load issues after subsequent db queries
    payment_response = PaymentRead.model_validate(payment)

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
                    str(data.amount), receipt,
                )
        except Exception as e:
            logger.warning("[SMS] Failed to send payment_received notification: %s", e)

    return payment_response


@router.get(
    "/api/v1/consultations/{consultation_id}/payments",
    response_model=list[PaymentRead],
)
async def list_payments(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("payments.view")),
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
    current_user: User = Depends(require_permission("payments.record")),
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
        push_forward_date=data.push_forward_date,
        future_installments=(
            [a.model_dump() for a in data.future_installments]
            if data.future_installments else None
        ),
    )
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")

    # Serialize before SMS queries to avoid lazy-load issues
    inst_response = InstallmentRead.model_validate(inst)

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

    return inst_response
