import uuid
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import (
    ClientAvailabilityCreate,
    ClientAvailabilityRead,
    ClientAvailabilityUpdate,
    FindAndLockRequest,
    InstructorScheduleDay,
    LockScheduleRequest,
    ScheduleSlot,
    WeeklyScheduleEntry,
    WeeklyScheduleResponse,
)
from app.services import scheduling as scheduling_service

router = APIRouter(tags=["scheduling"])


# ── Client Availability ──


@router.post(
    "/api/v1/availabilities",
    response_model=ClientAvailabilityRead,
    status_code=201,
)
async def create_availability(
    data: ClientAvailabilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(data.cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    avail = await scheduling_service.create_availability(
        db, cid, data.day_of_week, data.start_time,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    return ClientAvailabilityRead.model_validate(avail)


@router.get(
    "/api/v1/cart-items/{cart_item_id}/availabilities",
    response_model=list[ClientAvailabilityRead],
)
async def list_availability(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    avails = await scheduling_service.list_availability(db, cid, company_id=current_user.company_id, current_user_role=current_user.role)
    return [ClientAvailabilityRead.model_validate(a) for a in avails]


@router.patch(
    "/api/v1/availabilities/{avail_id}",
    response_model=ClientAvailabilityRead,
)
async def update_availability(
    avail_id: str,
    data: ClientAvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        aid = uuid.UUID(avail_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid availability ID")
    kwargs: dict = {}
    if data.day_of_week is not None:
        kwargs["day_of_week"] = data.day_of_week
    if data.start_time is not None:
        kwargs["start_time"] = data.start_time
    kwargs["company_id"] = current_user.company_id
    kwargs["current_user_role"] = current_user.role
    avail = await scheduling_service.update_availability(db, aid, **kwargs)
    if not avail:
        raise HTTPException(status_code=404, detail="Availability not found")
    return ClientAvailabilityRead.model_validate(avail)


@router.delete("/api/v1/availabilities/{avail_id}", status_code=204)
async def delete_availability(
    avail_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        aid = uuid.UUID(avail_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid availability ID")
    deleted = await scheduling_service.delete_availability(db, aid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not deleted:
        raise HTTPException(status_code=404, detail="Availability not found")


# ── Schedule ──


@router.get(
    "/api/v1/instructors/{instructor_id}/schedule",
    response_model=InstructorScheduleDay,
)
async def get_instructor_schedule(
    instructor_id: str,
    on_date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        d = date.fromisoformat(on_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    slots = await scheduling_service.get_instructor_schedule(db, instructor_id, d)
    day = InstructorScheduleDay(date=d, slots=[], collisions=[])
    for s in slots:
        day.slots.append(ScheduleSlot(**s))
    resp = await scheduling_service.get_full_day_schedule(db, instructor_id, d, company_id=current_user.company_id)
    day.collisions = resp["collisions"]
    return day


@router.get("/api/v1/schedule/weekly", response_model=WeeklyScheduleResponse)
async def get_weekly_schedule(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format (Monday)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        d = date.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    result = await scheduling_service.get_weekly_schedule(
        db, d,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    return WeeklyScheduleResponse(
        start_date=result["start_date"],
        days=result["days"],
        slots=[WeeklyScheduleEntry(**s) for s in result["slots"]],
    )


@router.post("/api/v1/lesson-plans/{plan_id}/find-and-lock")
async def find_and_lock_schedule(
    plan_id: str,
    data: FindAndLockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Try each preferred start time in order. If one fits, lock the plan's schedule.
    If none fit, return the instructor's full day schedule with collisions highlighted."""
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    vid = uuid.UUID(data.vehicle_id) if data.vehicle_id else None
    vid_auto = uuid.UUID(data.vehicle_id_auto) if data.vehicle_id_auto else None
    result = await scheduling_service.find_and_lock_schedule(
        db,
        plan_id=pid,
        instructor_id=data.instructor_id,
        start_date=data.start_date,
        preferred_times=data.preferred_times,
        vehicle_id=vid,
        instructor_id_auto=data.instructor_id_auto,
        vehicle_id_auto=vid_auto,
        manual_days=data.manual_days,
        company_id=current_user.company_id,
    )
    return result


@router.post("/api/v1/lesson-plans/{plan_id}/lock-schedule")
async def lock_schedule(
    plan_id: str,
    data: LockScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    try:
        start = time.fromisoformat(data.start_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format")
    vid = uuid.UUID(data.vehicle_id) if data.vehicle_id else None
    vid_auto = uuid.UUID(data.vehicle_id_auto) if data.vehicle_id_auto else None
    start_date = data.start_date
    try:
        lessons = await scheduling_service.lock_schedule(
            db, pid, start, instructor_id=data.instructor_id, vehicle_id=vid,
            start_date=start_date,
            instructor_id_auto=data.instructor_id_auto,
            vehicle_id_auto=vid_auto,
            manual_days=data.manual_days,
            company_id=current_user.company_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"locked": len(lessons), "message": f"Locked {len(lessons)} lessons to {data.start_time}"}


@router.get(
    "/api/v1/instructors/{instructor_id}/find-slot",
)
async def find_available_slot(
    instructor_id: str,
    on_date: str = Query(...),
    preferred_times: str = Query(..., description="Comma-separated HH:MM times, e.g. 17:00,18:00"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check each preferred start time in order and return the first available slot."""
    try:
        d = date.fromisoformat(on_date)
        preferred = [time.fromisoformat(t.strip()) for t in preferred_times.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date/time format")

    result = await scheduling_service.check_preferred_times(db, instructor_id, d, preferred, company_id=current_user.company_id)
    if not result:
        full = await scheduling_service.get_full_day_schedule(db, instructor_id, d, company_id=current_user.company_id)
        return {"available": False, "schedule": full, "message": "No preferred time available"}
    found_start, found_end, _ = result
    return {
        "available": True,
        "start_time": found_start.isoformat(),
        "end_time": found_end.isoformat(),
    }
