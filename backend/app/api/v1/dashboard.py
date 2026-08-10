import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.user import User
from app.services import dashboard as dashboard_service

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/mobile", response_model=dict)
async def mobile_dashboard(
    period: str = Query("today", pattern="^(today|yesterday|this_week|last_week|this_month)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("dashboard.view"))
):
    result = await dashboard_service.get_mobile_dashboard(
        db,
        company_id=current_user.company_id,
        user_id=current_user.phone,
        user_role=current_user.role,
        period=period,
    )
    return result
