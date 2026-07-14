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


async def _verify_payment_company(
    db: AsyncSession, payment_id: uuid.UUID, user: User
) -> Payment:
    """Load a payment and verify the user's company has access to it."""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(
            selectinload(Payment.consultation)
            .selectinload(Consultation.branch)
            .selectinload(Branch.company)
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if user.role != UserRole.SUPER_USER and user.company_id is not None:
        branch = payment.consultation.branch if payment.consultation else None
        if not branch or branch.company_id != user.company_id:
            raise HTTPException(status_code=404, detail="Payment not found")
    return payment


def _company_name_from_payment(payment: Payment) -> str:
    """Extract the company name from the payment's consultation → branch → company chain."""
    try:
        return payment.consultation.branch.company.name
    except (AttributeError, TypeError):
        return settings.app_name


@router.get("/api/v1/receipts/{payment_id}/download")
async def download_receipt(
    payment_id: uuid.UUID,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = await _verify_payment_company(db, payment_id, current_user)
    company_name = _company_name_from_payment(payment)
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
    # Verify company access and load company name
    company_name = settings.app_name
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        consult_result = await db.execute(
            select(Consultation)
            .where(Consultation.id == cid)
            .options(
                selectinload(Consultation.branch)
                .selectinload(Branch.company)
            )
        )
        consultation = consult_result.scalar_one_or_none()
        if not consultation or not consultation.branch or consultation.branch.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Consultation not found")
        company_name = consultation.branch.company.name
    else:
        consult_result = await db.execute(
            select(Consultation)
            .where(Consultation.id == cid)
            .options(
                selectinload(Consultation.branch)
                .selectinload(Branch.company)
            )
        )
        consultation = consult_result.scalar_one_or_none()
        if consultation and consultation.branch and consultation.branch.company:
            company_name = consultation.branch.company.name

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
    payment = await _verify_payment_company(db, payment_id, current_user)

    url = await get_receipt_download_url(payment_id)
    return {
        "url": url,
        "system_receipt_number": payment.system_receipt_number,
    }
