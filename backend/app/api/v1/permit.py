import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.permit import PermitProgressRead, PermitProgressUpdate
from app.services import permit as permit_service

router = APIRouter(prefix="/cart-items", tags=["permit"])


@router.get("/{cart_item_id}/permit-progress", response_model=PermitProgressRead | None)
async def get_permit_progress(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    progress = await permit_service.get_permit_progress(db, cid)
    if progress is None:
        return None
    return PermitProgressRead.model_validate(progress)


@router.patch("/{cart_item_id}/permit-progress", response_model=PermitProgressRead)
async def update_permit_progress(
    cart_item_id: str,
    data: PermitProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    progress = await permit_service.upsert_permit_progress(
        db, cid,
        start_date=data.start_date,
        got_learners_permit_date=data.got_learners_permit_date,
        learners_due_date=data.learners_due_date,
        learners_expiry_date=data.learners_expiry_date,
        tested_on_date=data.tested_on_date,
        expecting_permit_on_date=data.expecting_permit_on_date,
        delayed_days=data.delayed_days,
        notes=data.notes,
    )
    return PermitProgressRead.model_validate(progress)
