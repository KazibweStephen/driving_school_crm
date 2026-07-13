from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.bulk_onboarding import BulkOnboardingRequest, BulkOnboardingResponse
from app.services import bulk_onboarding

router = APIRouter(prefix="/bulk-onboarding", tags=["bulk-onboarding"])


class ReceiptCheckRequest(BaseModel):
    receipt_numbers: list[str]


class ReceiptCheckResponse(BaseModel):
    existing: list[str]


@router.post("", response_model=BulkOnboardingResponse, status_code=status.HTTP_201_CREATED)
async def bulk_onboard(
    data: BulkOnboardingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await bulk_onboarding.bulk_onboard_clients(db, current_user, data)
    return BulkOnboardingResponse(**result)


@router.post("/check-receipts", response_model=ReceiptCheckResponse)
async def check_receipts(
    data: ReceiptCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.payment import get_payment_by_receipt

    existing = []
    for receipt_number in data.receipt_numbers:
        if not receipt_number or len(receipt_number) < 2:
            continue
        payment = await get_payment_by_receipt(db, receipt_number)
        if payment is not None:
            existing.append(receipt_number)
    return ReceiptCheckResponse(existing=existing)
