import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.schedule_break import ScheduleBreakCreate, ScheduleBreakRead, ScheduleBreakUpdate
from app.services import schedule_break as break_service

router = APIRouter(tags=["schedule-breaks"])


@router.get("/api/v1/schedule-breaks", response_model=list[ScheduleBreakRead])
async def list_breaks(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    breaks = await break_service.list_breaks(db, active_only=active_only)
    return [ScheduleBreakRead.model_validate(b) for b in breaks]


@router.post("/api/v1/schedule-breaks", response_model=ScheduleBreakRead, status_code=201)
async def create_break(
    data: ScheduleBreakCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    break_ = await break_service.create_break(
        db,
        name=data.name,
        start_time=data.start_time,
        end_time=data.end_time,
        is_active=data.is_active,
        is_standard=data.is_standard,
    )
    return ScheduleBreakRead.model_validate(break_)


@router.patch("/api/v1/schedule-breaks/{break_id}", response_model=ScheduleBreakRead)
async def update_break(
    break_id: str,
    data: ScheduleBreakUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        bid = uuid.UUID(break_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid break ID")
    break_ = await break_service.get_break(db, bid)
    if not break_:
        raise HTTPException(status_code=404, detail="Break not found")
    updated = await break_service.update_break(
        db, break_,
        name=data.name,
        start_time=data.start_time,
        end_time=data.end_time,
        is_active=data.is_active,
        is_standard=data.is_standard,
    )
    return ScheduleBreakRead.model_validate(updated)


@router.delete("/api/v1/schedule-breaks/{break_id}", status_code=204)
async def delete_break(
    break_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        bid = uuid.UUID(break_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid break ID")
    break_ = await break_service.get_break(db, bid)
    if not break_:
        raise HTTPException(status_code=404, detail="Break not found")
    await break_service.delete_break(db, break_)
