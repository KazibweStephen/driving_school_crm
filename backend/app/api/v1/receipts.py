import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.company import Branch, Company
from app.models.consultation import Consultation
from app.models.payment import Payment
from app.models.user import User, UserRole
from app.services.receipt import generate_receipt_html, generate_consolidated_receipt_html, get_receipt_download_url

router = APIRouter(tags=["receipts"])


async def _load_payment_with_relationships(db: AsyncSession, payment_id: uuid.UUID) -> Payment | None:
    """Load a payment with all relationships needed for company resolution."""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(
            selectinload(Payment.consultation)
            .selectinload(Consultation.branch)
            .selectinload(Branch.company)
        )
    )
    return result.scalar_one_or_none()


async def _resolve_company_name(db: AsyncSession, payment: Payment) -> str:
    """Resolve company name from payment → consultation → branch → company.
    Falls back to consultation.created_by_phone → user.company_id → company.
    """
    # Primary path: branch → company
    try:
        if payment.consultation and payment.consultation.branch and payment.consultation.branch.company:
            return payment.consultation.branch.company.name
    except AttributeError:
        pass

    # Fallback: created_by_phone → user.company_id → company
    try:
        created_by = getattr(payment.consultation, 'created_by_phone', None)
        if created_by:
            user_result = await db.execute(
                select(User.company_id).where(User.phone == created_by)
            )
            company_id = user_result.scalar_one_or_none()
            if company_id:
                co_result = await db.execute(select(Company.name).where(Company.id == company_id))
                name = co_result.scalar_one_or_none()
                if name:
                    return name
    except Exception:
        pass

    return settings.app_name


async def _resolve_company_name_from_consultation(db: AsyncSession, consultation: Consultation) -> str:
    """Resolve company name from a consultation (for consolidated receipts)."""
    # Primary path: branch → company
    try:
        if consultation.branch and consultation.branch.company:
            return consultation.branch.company.name
    except AttributeError:
        pass

    # Fallback: created_by_phone → user.company_id → company
    try:
        created_by = getattr(consultation, 'created_by_phone', None)
        if created_by:
            user_result = await db.execute(
                select(User.company_id).where(User.phone == created_by)
            )
            company_id = user_result.scalar_one_or_none()
            if company_id:
                co_result = await db.execute(select(Company.name).where(Company.id == company_id))
                name = co_result.scalar_one_or_none()
                if name:
                    return name
    except Exception:
        pass

    return settings.app_name


@router.get("/api/v1/receipts/{payment_id}/download")
async def download_receipt(
    payment_id: uuid.UUID,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = await _load_payment_with_relationships(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        branch = payment.consultation.branch if payment.consultation else None
        if not branch or branch.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Payment not found")
    company_name = await _resolve_company_name(db, payment)
    html = await generate_receipt_html(db, payment_id, served_by_name=current_user.name, company_name=company_name)
    filename = f"receipt-{payment_id}.html"
    disposition = "attachment" if download else "inline"
    return HTMLResponse(
        content=html,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
        },
    )


@router.get("/api/v1/receipts/by-number/{receipt_number}")
async def download_consolidated_receipt(
    receipt_number: str,
    consultation_id: str,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = uuid.UUID(consultation_id)
    consult_result = await db.execute(
        select(Consultation)
        .where(Consultation.id == cid)
        .options(
            selectinload(Consultation.branch)
            .selectinload(Branch.company)
        )
    )
    consultation = consult_result.scalar_one_or_none()
    if not consultation:
        raise HTTPException(status_code=404, detail="Consultation not found")
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        if not consultation.branch or consultation.branch.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Consultation not found")

    company_name = await _resolve_company_name_from_consultation(db, consultation)
    html = await generate_consolidated_receipt_html(
        db, receipt_number, cid, served_by_name=current_user.name, company_name=company_name
    )
    filename = f"receipt-{receipt_number}.html"
    disposition = "attachment" if download else "inline"
    return HTMLResponse(
        content=html,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
        },
    )


@router.get("/api/v1/receipts/{payment_id}/link")
async def get_receipt_link(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = await _load_payment_with_relationships(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        branch = payment.consultation.branch if payment.consultation else None
        if not branch or branch.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Payment not found")

    url = await get_receipt_download_url(payment_id)
    return {
        "url": url,
        "system_receipt_number": payment.system_receipt_number,
    }
