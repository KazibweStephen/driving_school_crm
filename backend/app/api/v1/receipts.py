import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.company import Branch
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
        .options(selectinload(Payment.consultation).selectinload(Consultation.branch))
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if user.role != UserRole.SUPER_USER and user.company_id is not None:
        branch = payment.consultation.branch if payment.consultation else None
        if not branch or branch.company_id != user.company_id:
            raise HTTPException(status_code=404, detail="Payment not found")
    return payment


@router.get("/api/v1/receipts/{payment_id}/download")
async def download_receipt(
    payment_id: uuid.UUID,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_payment_company(db, payment_id, current_user)
    html = await generate_receipt_html(db, payment_id, served_by_name=current_user.name)
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
    # Verify company access to the consultation
    cid = uuid.UUID(consultation_id)
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        consult_result = await db.execute(
            select(Consultation)
            .where(Consultation.id == cid)
            .options(selectinload(Consultation.branch))
        )
        consultation = consult_result.scalar_one_or_none()
        if not consultation or not consultation.branch or consultation.branch.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Consultation not found")

    html = await generate_consolidated_receipt_html(
        db, receipt_number, cid, served_by_name=current_user.name
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
