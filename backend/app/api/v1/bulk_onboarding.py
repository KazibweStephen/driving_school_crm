from datetime import date
from typing import Annotated

import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.user import User
from app.schemas.bulk_onboarding import (
    BulkCorrectionResult,
    BulkOnboardingCorrection,
    BulkOnboardingRequest,
    BulkOnboardingResponse,
    OnboardedClientListResponse,
)
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
    current_user: User = Depends(require_permission("bulk_onboarding.manage")),
):
    result = await bulk_onboarding.bulk_onboard_clients(db, current_user, data)
    return BulkOnboardingResponse(**result)


@router.post("/check-receipts", response_model=ReceiptCheckResponse)
async def check_receipts(
    data: ReceiptCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("bulk_onboarding.manage")),
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


@router.get("/clients", response_model=OnboardedClientListResponse)
async def list_onboarded_clients(
    branch_id: Annotated[_uuid.UUID, Query()],
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query()] = 1,
    page_size: Annotated[int, Query()] = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("bulk_onboarding.manage")),
):
    result = await bulk_onboarding.list_onboarded_clients(
        db, current_user, branch_id, from_date, to_date, search, page, page_size
    )
    return result


@router.patch("/clients/{consultation_id}", response_model=BulkCorrectionResult)
async def correct_onboarded_client(
    consultation_id: _uuid.UUID,
    data: BulkOnboardingCorrection,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("bulk_onboarding.edit")),
):
    if not getattr(current_user, "can_edit_onboarded_clients", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editing onboarded clients is not enabled for this user",
        )
    result = await bulk_onboarding.apply_bulk_onboarding_corrections(
        db, current_user, consultation_id, data
    )
    return BulkCorrectionResult(**result)
