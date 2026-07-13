from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.bulk_onboarding import BulkOnboardingRequest, BulkOnboardingResponse
from app.services import bulk_onboarding

router = APIRouter(prefix="/bulk-onboarding", tags=["bulk-onboarding"])


@router.post("", response_model=BulkOnboardingResponse, status_code=status.HTTP_201_CREATED)
async def bulk_onboard(
    data: BulkOnboardingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await bulk_onboarding.bulk_onboard_clients(db, current_user, data)
    return BulkOnboardingResponse(**result)
