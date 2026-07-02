from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import payment as payment_service

router = APIRouter(tags=["payments"])


@router.get("/api/v1/payments/check-receipt/{receipt_number}")
async def check_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = await payment_service.get_payment_by_receipt(db, receipt_number)
    return {"exists": payment is not None}
