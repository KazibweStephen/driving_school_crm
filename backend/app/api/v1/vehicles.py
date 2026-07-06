import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import VehicleCreate, VehicleRead, VehicleUpdate
from app.services import vehicle as vehicle_service

router = APIRouter(tags=["vehicles"])


@router.get("/api/v1/vehicles", response_model=list[VehicleRead])
async def list_vehicles(
    status: str | None = Query(None),
    transmission: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vehicles = await vehicle_service.list_vehicles(db, status, transmission)
    result = []
    for v in vehicles:
        item = VehicleRead.model_validate(v)
        item.branch_ids = await vehicle_service._get_branch_ids(db, v.id)
        result.append(item)
    return result


@router.post("/api/v1/vehicles", response_model=VehicleRead, status_code=201)
async def create_vehicle(
    data: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vehicle = await vehicle_service.create_vehicle(
        db,
        name=data.name,
        plate_number=data.plate_number,
        transmission=data.transmission,
        notes=data.notes,
        branch_ids=data.branch_ids,
    )
    v = VehicleRead.model_validate(vehicle)
    v.branch_ids = await vehicle_service._get_branch_ids(db, vehicle.id)
    return v


@router.get("/api/v1/vehicles/{vehicle_id}", response_model=VehicleRead)
async def get_vehicle(
    vehicle_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(vehicle_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid vehicle ID")
    vehicle = await vehicle_service.get_vehicle_by_id(db, vid)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    v = VehicleRead.model_validate(vehicle)
    v.branch_ids = await vehicle_service._get_branch_ids(db, vehicle.id)
    return v


@router.patch("/api/v1/vehicles/{vehicle_id}", response_model=VehicleRead)
async def update_vehicle(
    vehicle_id: str,
    data: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(vehicle_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid vehicle ID")
    vehicle = await vehicle_service.get_vehicle_by_id(db, vid)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    updated = await vehicle_service.update_vehicle(
        db, vehicle,
        name=data.name,
        plate_number=data.plate_number,
        transmission=data.transmission,
        status=data.status,
        notes=data.notes,
        branch_ids=data.branch_ids,
    )
    v = VehicleRead.model_validate(updated)
    v.branch_ids = await vehicle_service._get_branch_ids(db, vehicle.id)
    return v


@router.delete("/api/v1/vehicles/{vehicle_id}", status_code=204)
async def delete_vehicle(
    vehicle_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(vehicle_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid vehicle ID")
    vehicle = await vehicle_service.get_vehicle_by_id(db, vid)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await vehicle_service.delete_vehicle(db, vehicle)
