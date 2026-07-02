import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson_plan import TransmissionType, Vehicle, VehicleStatus


async def create_vehicle(
    db: AsyncSession,
    name: str,
    plate_number: str,
    transmission: str,
    notes: str | None = None,
) -> Vehicle:
    vehicle = Vehicle(
        name=name,
        plate_number=plate_number,
        transmission=TransmissionType(transmission),
        notes=notes,
    )
    db.add(vehicle)
    await db.flush()
    await db.refresh(vehicle)
    return vehicle


async def get_vehicle_by_id(db: AsyncSession, vehicle_id: uuid.UUID) -> Vehicle | None:
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    return result.scalar_one_or_none()


async def list_vehicles(
    db: AsyncSession,
    status: str | None = None,
    transmission: str | None = None,
) -> list[Vehicle]:
    query = select(Vehicle).order_by(Vehicle.name.asc())
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
    await db.flush()
    await db.refresh(vehicle)
    return vehicle


async def delete_vehicle(db: AsyncSession, vehicle: Vehicle) -> None:
    await db.delete(vehicle)
    await db.flush()
