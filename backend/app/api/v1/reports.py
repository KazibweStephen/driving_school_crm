import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.user import User
from app.schemas.reports import DashboardSummary, PeriodReportResponse
from app.services import period_reports as period_reports_service
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


@router.get("/period", response_model=PeriodReportResponse)
async def get_period_report(
    period: str = Query("month", pattern="^(week|month|quarter|year)$"),
    anchor: date | None = Query(
        None, description="Any date inside the period; defaults to today"
    ),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    risk_days: int = Query(14, ge=1, le=365, description="Idle days before a client is at risk"),
    top_n: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("period_reports.view")),
):
    """Week / month / quarter / year performance report.

    Sales, collections, conversions, expenses, goal attainment, best selling
    products, best performing staff and clients who have gone quiet while still
    owing money. Gated by ``period_reports.view`` so a company can decide who
    sees it without touching the older ``reports`` permissions.
    """
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b] if branch_ids else None
    )
    resolved = await resolve_branch_ids(db, current_user, requested)
    # Cash and clients that belong to no branch at all (legacy branch-less
    # consultations) only belong in the totals when the caller already sees
    # every branch, so a single-branch report is never inflated by them.
    include_unassigned = await period_reports_service.covers_all_company_branches(
        db, current_user.company_id, resolved
    )
    report = await period_reports_service.build_period_report(
        db,
        company_id=current_user.company_id,
        branch_ids=resolved,
        period=period,
        anchor=anchor,
        risk_days=risk_days,
        top_n=top_n,
        include_unassigned=include_unassigned,
    )
    return PeriodReportResponse(**report)
