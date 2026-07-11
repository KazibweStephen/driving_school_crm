import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.lesson_plan import Vehicle, VehicleAssignment
from app.models.user import User
from app.schemas.lesson_plan import (
    VehicleAssignmentCreate,
    VehicleAssignmentRead,
    VehicleAssignmentTransfer,
)
from app.services import vehicle_assignment as assignment_service
from app.services.vehicle import get_vehicle_by_id

router = APIRouter(tags=["vehicle-assignments"])


@router.get("/api/v1/vehicle-assignments", response_model=list[VehicleAssignmentRead])
async def list_assignments(
    vehicle_id: str | None = Query(None),
    instructor_id: str | None = Query(None),
    on_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vid = uuid.UUID(vehicle_id) if vehicle_id else None
    assignments = await assignment_service.list_assignments(
        db, vid, instructor_id, on_date,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    return [VehicleAssignmentRead.model_validate(a) for a in assignments]


@router.get("/api/v1/vehicle-assignments/{assignment_id}", response_model=VehicleAssignmentRead)
async def get_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        aid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")
    query = select(VehicleAssignment).where(VehicleAssignment.id == aid)
    if current_user.role.value != 'super_user' and current_user.company_id is not None:
        query = (query.join(Vehicle, VehicleAssignment.vehicle_id == Vehicle.id)
                 .where(Vehicle.company_id == current_user.company_id))
    result = await db.execute(query)
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return VehicleAssignmentRead.model_validate(assignment)


@router.post("/api/v1/vehicle-assignments", response_model=VehicleAssignmentRead, status_code=201)
async def create_assignment(
    data: VehicleAssignmentCreate,
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
    assignment = await assignment_service.create_assignment(
        db, vid, data.instructor_id, data.assigned_from, data.assigned_until
    )
    return VehicleAssignmentRead.model_validate(assignment)


@router.post("/api/v1/vehicle-assignments/transfer", response_model=VehicleAssignmentRead)
async def transfer_vehicle(
    data: VehicleAssignmentTransfer,
    vehicle_id: str = Query(...),
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
    assignment = await assignment_service.transfer_vehicle(
        db, vid, data.instructor_id, data.transfer_date, data.end_date, data.update_future_lessons,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    return VehicleAssignmentRead.model_validate(assignment)


@router.delete("/api/v1/vehicle-assignments/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        aid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")
    query = select(VehicleAssignment).where(VehicleAssignment.id == aid)
    if current_user.role.value != 'super_user' and current_user.company_id is not None:
        query = (query.join(Vehicle, VehicleAssignment.vehicle_id == Vehicle.id)
                 .where(Vehicle.company_id == current_user.company_id))
    result = await db.execute(query)
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await assignment_service.delete_assignment(db, assignment)
