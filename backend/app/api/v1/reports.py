from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.user import User
from app.schemas.reports import DashboardSummary
from app.services import reports as reports_service
from app.utils.tenant import resolve_branch_ids

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard", response_model=DashboardSummary)
async def get_dashboard(
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("dashboard.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = await resolve_branch_ids(db, current_user, requested)
    summary = await reports_service.get_dashboard_summary(
        db,
        company_id=current_user.company_id,
        user_role=current_user.role,
        branch_ids=resolved_branch_ids,
    )
    return DashboardSummary(**summary)
