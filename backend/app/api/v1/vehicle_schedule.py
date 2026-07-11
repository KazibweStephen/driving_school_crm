import uuid
from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import (
    VehicleScheduleSlotCreate,
    VehicleScheduleSlotRead,
    VehicleScheduleSlotUpdate,
)
from app.services import vehicle_schedule as schedule_service
from app.services.vehicle import get_vehicle_by_id

router = APIRouter(tags=["vehicle-schedule"])


@router.get("/api/v1/vehicle-schedule", response_model=list[VehicleScheduleSlotRead])
async def list_slots(
    vehicle_id: str | None = Query(None),
    instructor_id: str | None = Query(None),
    day_of_week: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vid = uuid.UUID(vehicle_id) if vehicle_id else None
    slots = await schedule_service.list_slots(
        db, vid, instructor_id, day_of_week,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    return [VehicleScheduleSlotRead.model_validate(s) for s in slots]


@router.get("/api/v1/vehicle-schedule/{slot_id}", response_model=VehicleScheduleSlotRead)
async def get_slot(
    slot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(slot_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid slot ID")
    slot = await schedule_service.get_slot_by_id(
        db, sid,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    return VehicleScheduleSlotRead.model_validate(slot)


@router.post("/api/v1/vehicle-schedule", response_model=VehicleScheduleSlotRead, status_code=201)
async def create_slot(
    data: VehicleScheduleSlotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(data.vehicle_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid vehicle ID")
    vehicle = await get_vehicle_by_id(db, vid, company_id=current_user.company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    slot = await schedule_service.create_slot(
        db, vid, data.instructor_id, data.day_of_week, data.start_time, data.end_time
    )
    return VehicleScheduleSlotRead.model_validate(slot)


@router.patch("/api/v1/vehicle-schedule/{slot_id}", response_model=VehicleScheduleSlotRead)
async def update_slot(
    slot_id: str,
    data: VehicleScheduleSlotUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(slot_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid slot ID")
    slot = await schedule_service.get_slot_by_id(
        db, sid,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    updated = await schedule_service.update_slot(
        db, slot,
        instructor_id=data.instructor_id,
        start_time=data.start_time,
        end_time=data.end_time,
    )
    return VehicleScheduleSlotRead.model_validate(updated)


@router.delete("/api/v1/vehicle-schedule/{slot_id}", status_code=204)
async def delete_slot(
    slot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(slot_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid slot ID")
    slot = await schedule_service.get_slot_by_id(
        db, sid,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    await schedule_service.delete_slot(db, slot)


@router.put("/api/v1/vehicle-schedule/{vehicle_id}/bulk", response_model=list[VehicleScheduleSlotRead])
async def bulk_set_schedule(
    vehicle_id: str,
    slots: list[VehicleScheduleSlotCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(vehicle_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid vehicle ID")
    vehicle = await get_vehicle_by_id(db, vid, company_id=current_user.company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    created = await schedule_service.bulk_set_schedule(
        db, vid,
        [s.model_dump() for s in slots],
    )
    return [VehicleScheduleSlotRead.model_validate(s) for s in created]


@router.get("/api/v1/vehicle-schedule/{vehicle_id}/resolve-instructor")
async def resolve_instructor(
    vehicle_id: str,
    day_of_week: int = Query(...),
    at_time: str = Query(..., description="HH:MM time"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve which instructor is assigned to a vehicle at a given day+time."""
    try:
        vid = uuid.UUID(vehicle_id)
        t = time.fromisoformat(at_time)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid parameters")
    instructor_id = await schedule_service.get_instructor_for_vehicle(db, vid, day_of_week, t)
    return {"instructor_id": instructor_id}
