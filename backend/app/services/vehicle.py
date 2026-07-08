import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import VehicleBranchAssignment
from app.models.lesson_plan import TransmissionType, Vehicle, VehicleStatus


async def _sync_branch_assignments(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    branch_ids: list[uuid.UUID],
) -> None:
    """Replace all branch assignments for a vehicle with the given list."""
    await db.execute(
        delete(VehicleBranchAssignment).where(VehicleBranchAssignment.vehicle_id == vehicle_id)
    )
    for bid in branch_ids:
        db.add(VehicleBranchAssignment(vehicle_id=vehicle_id, branch_id=bid))
    await db.flush()


async def create_vehicle(
    db: AsyncSession,
    name: str,
    plate_number: str,
    transmission: str,
    notes: str | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    company_id: uuid.UUID | None = None,
) -> Vehicle:
    vehicle = Vehicle(
        name=name,
        plate_number=plate_number,
        transmission=TransmissionType(transmission),
        notes=notes,
        company_id=company_id,
    )
    db.add(vehicle)
    await db.flush()

    if branch_ids:
        for bid in branch_ids:
            db.add(VehicleBranchAssignment(vehicle_id=vehicle.id, branch_id=bid))
        await db.flush()

    await db.refresh(vehicle)
    return vehicle


async def get_vehicle_by_id(db: AsyncSession, vehicle_id: uuid.UUID, company_id: uuid.UUID | None = None) -> Vehicle | None:
    query = select(Vehicle).where(Vehicle.id == vehicle_id)
    if company_id:
        query = query.where(Vehicle.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def _get_branch_ids(db: AsyncSession, vehicle_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(VehicleBranchAssignment).where(VehicleBranchAssignment.vehicle_id == vehicle_id)
    )
    return [a.branch_id for a in result.scalars().all()]


async def list_vehicles(
    db: AsyncSession,
    status: str | None = None,
    transmission: str | None = None,
    company_id: uuid.UUID | None = None,
) -> list[Vehicle]:
    query = select(Vehicle).order_by(Vehicle.name.asc())
    if company_id:
        query = query.where(Vehicle.company_id == company_id)
    if status:
        query = query.where(Vehicle.status == VehicleStatus(status))
    if transmission:
        query = query.where(Vehicle.transmission == TransmissionType(transmission))
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_vehicle(
    db: AsyncSession,
    vehicle: Vehicle,
    name: str | None = None,
    plate_number: str | None = None,
    transmission: str | None = None,
    status: str | None = None,
    notes: str | None = None,
    branch_ids: list[uuid.UUID] | None = None,
) -> Vehicle:
    if name is not None:
        vehicle.name = name
    if plate_number is not None:
        vehicle.plate_number = plate_number
    if transmission is not None:
        vehicle.transmission = TransmissionType(transmission)
    if status is not None:
        vehicle.status = VehicleStatus(status)
    if notes is not None:
        vehicle.notes = notes
    if branch_ids is not None:
        await _sync_branch_assignments(db, vehicle.id, branch_ids)
    await db.flush()
    await db.refresh(vehicle)
    return vehicle


async def delete_vehicle(db: AsyncSession, vehicle: Vehicle) -> None:
    await db.delete(vehicle)
    await db.flush()
