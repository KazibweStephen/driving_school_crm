import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.commission import (
    CommissionRateCreate, CommissionRateRead, CommissionRateUpdate,
    CommissionCreate, CommissionRead, CommissionUpdate, CommissionListResponse,
)
from app.schemas.reports import CommissionReportResponse, CommissionReportItem
from app.services import commission as commission_service
from app.utils.tenant import resolve_company_id

router = APIRouter(prefix="/commission", tags=["commission"])


@router.get("/rates", response_model=list[CommissionRateRead])
async def list_rates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = await commission_service.list_commission_rates(
        db, current_user.company_id, current_user.role
    )
    return [
        CommissionRateRead(
            **{
                "id": r.id,
                "company_id": r.company_id,
                "name": r.name,
                "amount": r.amount,
                "lesson_type": r.lesson_type,
                "transmission_type": r.transmission_type,
                "is_active": r.is_active,
                "notes": r.notes,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
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
    rate = await commission_service.create_commission_rate(
        db, company_id, data.model_dump()
    )
    return await commission_service.get_commission_rate_by_id(db, rate.id, company_id)


@router.patch("/rates/{rate_id}", response_model=CommissionRateRead)
async def update_rate(
    rate_id: uuid.UUID,
    data: CommissionRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate = await commission_service.get_commission_rate_by_id(
        db, rate_id, current_user.company_id
    )
    if not rate:
        raise HTTPException(status_code=404, detail="Commission rate not found")
    await commission_service.update_commission_rate(
        db, rate, data.model_dump(exclude_unset=True)
    )
    return await commission_service.get_commission_rate_by_id(db, rate_id, current_user.company_id)


@router.delete("/rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rate(
    rate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate = await commission_service.get_commission_rate_by_id(
        db, rate_id, current_user.company_id
    )
    if not rate:
        raise HTTPException(status_code=404, detail="Commission rate not found")
    await commission_service.delete_commission_rate(db, rate)


@router.get("", response_model=CommissionListResponse)
async def list_commissions(
    instructor_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await commission_service.list_commissions(
        db,
        company_id=current_user.company_id,
        user_role=current_user.role,
        instructor_id=instructor_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    commission_list = []
    for c in items:
        d = CommissionRead(
            id=c.id,
            company_id=c.company_id,
            instructor_id=c.instructor_id,
            client_lesson_id=c.client_lesson_id,
            training_session_id=c.training_session_id,
            commission_rate_id=c.commission_rate_id,
            amount=c.amount,
            status=c.status.value if hasattr(c.status, 'value') else str(c.status),
            paid_at=c.paid_at,
            paid_by=c.paid_by,
            notes=c.notes,
            created_at=c.created_at,
            instructor_name=c.instructor.name if c.instructor else None,
            lesson_title=c.client_lesson.title if c.client_lesson else None,
        )
        commission_list.append(d)

    return CommissionListResponse(
        items=commission_list, total=total, page=page, page_size=page_size
    )


@router.post("", response_model=CommissionRead, status_code=status.HTTP_201_CREATED)
async def create_commission(
    data: CommissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    commission = await commission_service.create_commission(
        db, company_id, data.model_dump()
    )
    return await commission_service.get_commission_by_id(db, commission.id, company_id)


@router.patch("/{commission_id}", response_model=CommissionRead)
async def update_commission(
    commission_id: uuid.UUID,
    data: CommissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    commission = await commission_service.get_commission_by_id(
        db, commission_id, current_user.company_id
    )
    if not commission:
        raise HTTPException(status_code=404, detail="Commission not found")
    await commission_service.update_commission(
        db, commission, data.model_dump(exclude_unset=True)
    )
    return await commission_service.get_commission_by_id(db, commission_id, current_user.company_id)


@router.get("/report", response_model=CommissionReportResponse)
async def commission_report(
    instructor_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await commission_service.get_commission_report(
        db,
        company_id=current_user.company_id,
        user_role=current_user.role,
        instructor_id=instructor_id,
        date_from=date_from,
        date_to=date_to,
    )
    items = [CommissionReportItem(**item) for item in result["items"]]
    return CommissionReportResponse(
        items=items,
        grand_total=result["grand_total"],
        grand_paid=result["grand_paid"],
        grand_pending=result["grand_pending"],
    )
