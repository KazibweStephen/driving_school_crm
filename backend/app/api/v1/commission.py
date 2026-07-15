import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.commission import ContestStatus, CommissionContest
from app.models.consultation import Consultation
from app.schemas.commission import (
    CommissionRateCreate, CommissionRateRead, CommissionRateUpdate,
    CommissionRead, CommissionListResponse,
    ContestCreate, ContestResolve, ContestRead,
    CommissionSummaryResponse, CommissionSummaryItem, CommissionMaturity,
)
from app.services import commission as commission_service
from app.utils.tenant import resolve_company_id

router = APIRouter(prefix="/commission", tags=["commission"])


@router.get("/rates", response_model=list[CommissionRateRead])
async def list_rates(
    package_id: Optional[uuid.UUID] = Query(None),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = await commission_service.list_commission_rates(
        db, current_user.company_id, current_user.role,
        package_id=package_id, active_only=active_only
    )
    return [
        CommissionRateRead(
            id=r.id, company_id=r.company_id,
            package_ids=[p.id for p in (r.packages or [])],
            total_amount=r.total_amount,
            converter_pct=r.converter_pct,
            primary_recommender_pct=r.primary_recommender_pct,
            secondary_recommender_pct=r.secondary_recommender_pct,
            active_from=r.active_from, active_until=r.active_until,
            deactivated_at=r.deactivated_at, notes=r.notes,
            created_at=r.created_at, updated_at=r.updated_at,
            package_names=[p.name for p in (r.packages or [])],
        )
        for r in items
    ]


@router.post("/rates", response_model=CommissionRateRead, status_code=status.HTTP_201_CREATED)
async def create_rate(
    data: CommissionRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    try:
        rate = await commission_service.create_commission_rate(db, company_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    r = await commission_service.get_commission_rate_by_id(db, rate.id, company_id)
    return CommissionRateRead(
        id=r.id, company_id=r.company_id,
        package_ids=[p.id for p in (r.packages or [])],
        total_amount=r.total_amount,
        converter_pct=r.converter_pct,
        primary_recommender_pct=r.primary_recommender_pct,
        secondary_recommender_pct=r.secondary_recommender_pct,
        active_from=r.active_from, active_until=r.active_until,
        deactivated_at=r.deactivated_at, notes=r.notes,
        created_at=r.created_at, updated_at=r.updated_at,
        package_names=[p.name for p in (r.packages or [])],
    )


@router.patch("/rates/{rate_id}", response_model=CommissionRateRead)
async def update_rate(
    rate_id: uuid.UUID,
    data: CommissionRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate = await commission_service.get_commission_rate_by_id(db, rate_id, current_user.company_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Commission rate not found")
    await commission_service.update_commission_rate(db, rate, data.model_dump(exclude_unset=True))
    r = await commission_service.get_commission_rate_by_id(db, rate_id, current_user.company_id)
    return CommissionRateRead(
        id=r.id, company_id=r.company_id,
        package_ids=[p.id for p in (r.packages or [])],
        total_amount=r.total_amount,
        converter_pct=r.converter_pct,
        primary_recommender_pct=r.primary_recommender_pct,
        secondary_recommender_pct=r.secondary_recommender_pct,
        active_from=r.active_from, active_until=r.active_until,
        deactivated_at=r.deactivated_at, notes=r.notes,
        created_at=r.created_at, updated_at=r.updated_at,
        package_names=[p.name for p in (r.packages or [])],
    )


@router.delete("/rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rate(
    rate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate = await commission_service.get_commission_rate_by_id(db, rate_id, current_user.company_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Commission rate not found")
    await commission_service.deactivate_commission_rate(db, rate)


@router.get("", response_model=CommissionListResponse)
async def list_commissions(
    converter_id: Optional[str] = Query(None),
    recommender_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await commission_service.list_commissions(
        db, company_id=current_user.company_id, user_role=current_user.role,
        converter_id=converter_id, recommender_id=recommender_id,
        status=status, page=page, page_size=page_size,
    )
    commission_list = []
    for c in items:
        maturity = await commission_service.compute_maturity(db, c)
        client_name = None
        pkg_name = None
        if c.cart_item and c.cart_item.consultation_id:
            from app.models.consultation import Consultation
            cons = await db.execute(
                select(Consultation).where(Consultation.id == c.cart_item.consultation_id)
            )
            client = cons.scalar_one_or_none()
            client_name = " ".join(filter(None, [client.first_name, client.middle_name, client.last_name])) if client else None
        if c.cart_item and c.cart_item.package_id:
            from app.models.product import Package
            pkg_res = await db.execute(select(Package).where(Package.id == c.cart_item.package_id))
            pkg = pkg_res.scalar_one_or_none()
            pkg_name = pkg.name if pkg else None

        commission_list.append(CommissionRead(
            id=c.id, company_id=c.company_id, cart_item_id=c.cart_item_id,
            commission_rate_id=c.commission_rate_id,
            converter_id=c.converter_id,
            primary_recommender_id=c.primary_recommender_id,
            secondary_recommender_id=c.secondary_recommender_id,
            total_amount=c.total_amount,
            converter_amount=c.converter_amount,
            primary_recommender_amount=c.primary_recommender_amount,
            secondary_recommender_amount=c.secondary_recommender_amount,
            status=c.status.value if hasattr(c.status, 'value') else str(c.status),
            contest_status=c.contest_status.value if c.contest_status and hasattr(c.contest_status, 'value') else str(c.contest_status) if c.contest_status else None,
            notes=c.notes, created_at=c.created_at,
            maturity=CommissionMaturity(**maturity),
            converter_name=c.converter.name if c.converter else None,
            primary_recommender_name=c.primary_recommender.name if c.primary_recommender else None,
            secondary_recommender_name=c.secondary_recommender.name if c.secondary_recommender else None,
            client_name=client_name, package_name=pkg_name,
        ))

    return CommissionListResponse(items=commission_list, total=total, page=page, page_size=page_size)


@router.get("/{commission_id}", response_model=CommissionRead)
async def get_commission(
    commission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = await commission_service.get_commission_by_id(db, commission_id, current_user.company_id)
    if not c:
        raise HTTPException(status_code=404, detail="Commission not found")
    maturity = await commission_service.compute_maturity(db, c)
    client_name = None
    pkg_name = None
    if c.cart_item:
        from app.models.consultation import Consultation
        cons = await db.execute(
            select(Consultation).where(Consultation.id == c.cart_item.consultation_id)
        )
        client = cons.scalar_one_or_none()
        client_name = client.client_name if client else None
    if c.commission_rate and c.commission_rate.package:
        pkg_name = c.commission_rate.package.name
    return CommissionRead(
        id=c.id, company_id=c.company_id, cart_item_id=c.cart_item_id,
        commission_rate_id=c.commission_rate_id,
        converter_id=c.converter_id,
        primary_recommender_id=c.primary_recommender_id,
        secondary_recommender_id=c.secondary_recommender_id,
        total_amount=c.total_amount,
        converter_amount=c.converter_amount,
        primary_recommender_amount=c.primary_recommender_amount,
        secondary_recommender_amount=c.secondary_recommender_amount,
        status=c.status.value if hasattr(c.status, 'value') else str(c.status),
        contest_status=c.contest_status.value if c.contest_status and hasattr(c.contest_status, 'value') else str(c.contest_status) if c.contest_status else None,
        notes=c.notes, created_at=c.created_at,
        maturity=CommissionMaturity(**maturity),
        converter_name=c.converter.name if c.converter else None,
        primary_recommender_name=c.primary_recommender.name if c.primary_recommender else None,
        secondary_recommender_name=c.secondary_recommender.name if c.secondary_recommender else None,
        client_name=client_name, package_name=pkg_name,
    )
    return CommissionRead(
        id=c.id, company_id=c.company_id, cart_item_id=c.cart_item_id,
        commission_rate_id=c.commission_rate_id,
        converter_id=c.converter_id,
        primary_recommender_id=c.primary_recommender_id,
        secondary_recommender_id=c.secondary_recommender_id,
        total_amount=c.total_amount,
        converter_amount=c.converter_amount,
        primary_recommender_amount=c.primary_recommender_amount,
        secondary_recommender_amount=c.secondary_recommender_amount,
        status=c.status.value if hasattr(c.status, 'value') else str(c.status),
        contest_status=c.contest_status.value if c.contest_status and hasattr(c.contest_status, 'value') else str(c.contest_status) if c.contest_status else None,
        notes=c.notes, created_at=c.created_at,
        maturity=CommissionMaturity(**maturity),
        converter_name=c.converter.name if c.converter else None,
        primary_recommender_name=c.primary_recommender.name if c.primary_recommender else None,
        secondary_recommender_name=c.secondary_recommender.name if c.secondary_recommender else None,
        client_name=client_name, package_name=pkg_name,
    )


@router.get("/my-dashboard/summary", response_model=CommissionSummaryResponse)
async def my_commission_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await commission_service.get_user_commission_summary(
        db, current_user.company_id, current_user.phone, current_user.role
    )
    items = [CommissionSummaryItem(**i) for i in result["items"]]
    return CommissionSummaryResponse(
        items=items,
        total_commission=result["total_commission"],
        total_matured=result["total_matured"],
        total_remaining=result["total_remaining"],
    )


@router.post("/{commission_id}/contest", response_model=ContestRead)
async def create_contest(
    commission_id: uuid.UUID,
    data: ContestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    commission = await commission_service.get_commission_by_id(db, commission_id, current_user.company_id)
    if not commission:
        raise HTTPException(status_code=404, detail="Commission not found")
    contest = await commission_service.create_contest(db, commission_id, current_user.phone, data.reason)
    return ContestRead(
        id=contest.id, commission_id=contest.commission_id,
        contested_by_id=contest.contested_by_id, reason=contest.reason,
        status=contest.status.value if hasattr(contest.status, 'value') else str(contest.status),
        resolution=contest.resolution, resolved_by_id=contest.resolved_by_id,
        created_at=contest.created_at, resolved_at=contest.resolved_at,
        contested_by_name=current_user.name,
    )


@router.get("/contests/list", response_model=list[ContestRead])
async def list_contests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = await commission_service.list_contests(db, current_user.company_id, current_user.role)
    return [
        ContestRead(
            id=item.id, commission_id=item.commission_id,
            contested_by_id=item.contested_by_id, reason=item.reason,
            status=item.status.value if hasattr(item.status, 'value') else str(item.status),
            resolution=item.resolution, resolved_by_id=item.resolved_by_id,
            created_at=item.created_at, resolved_at=item.resolved_at,
            contested_by_name=item.contested_by.name if item.contested_by else None,
            resolved_by_name=item.resolved_by.name if item.resolved_by else None,
        )
        for item in items
    ]


@router.patch("/contests/{contest_id}/resolve", response_model=ContestRead)
async def resolve_contest(
    contest_id: uuid.UUID,
    data: ContestResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.commission import CommissionContest
    result = await db.execute(
        select(CommissionContest).where(CommissionContest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    resolved = await commission_service.resolve_contest(
        db, contest, current_user.phone, data.model_dump()
    )
    return ContestRead(
        id=resolved.id, commission_id=resolved.commission_id,
        contested_by_id=resolved.contested_by_id, reason=resolved.reason,
        status=resolved.status.value if hasattr(resolved.status, 'value') else str(resolved.status),
        resolution=resolved.resolution, resolved_by_id=resolved.resolved_by_id,
        created_at=resolved.created_at, resolved_at=resolved.resolved_at,
        contested_by_name=resolved.contested_by.name if resolved.contested_by else None,
        resolved_by_name=resolved.resolved_by.name if resolved.resolved_by else None,
    )
