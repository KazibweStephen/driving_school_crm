import uuid
from datetime import date

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson_plan import VehicleAssignment, ClientLesson


async def create_assignment(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    instructor_id: str,
    assigned_from: date,
    assigned_until: date | None = None,
) -> VehicleAssignment:
    assignment = VehicleAssignment(
        vehicle_id=vehicle_id,
        instructor_id=instructor_id,
        assigned_from=assigned_from,
        assigned_until=assigned_until,
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)
    return assignment


async def list_assignments(
    db: AsyncSession,
    vehicle_id: uuid.UUID | None = None,
    instructor_id: str | None = None,
    on_date: date | None = None,
) -> list[VehicleAssignment]:
    query = select(VehicleAssignment).order_by(VehicleAssignment.assigned_from.desc())
    if vehicle_id:
        query = query.where(VehicleAssignment.vehicle_id == vehicle_id)
    if instructor_id:
        query = query.where(VehicleAssignment.instructor_id == instructor_id)
    if on_date:
        query = query.where(
            and_(
                VehicleAssignment.assigned_from <= on_date,
                (
                    VehicleAssignment.assigned_until.is_(None)
                    | (VehicleAssignment.assigned_until >= on_date)
                ),
            )
        )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_current_assignment(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    on_date: date,
) -> VehicleAssignment | None:
    result = await db.execute(
        select(VehicleAssignment).where(
            and_(
                VehicleAssignment.vehicle_id == vehicle_id,
                VehicleAssignment.assigned_from <= on_date,
                (
                    VehicleAssignment.assigned_until.is_(None)
                    | (VehicleAssignment.assigned_until >= on_date)
                ),
            )
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def transfer_vehicle(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    new_instructor_id: str,
    transfer_date: date,
    end_date: date | None = None,
    update_future_lessons: bool = True,
) -> VehicleAssignment:
    existing = await get_current_assignment(db, vehicle_id, transfer_date)
    if existing:
        if existing.assigned_until is None or existing.assigned_until >= transfer_date:
            existing.assigned_until = transfer_date
            await db.flush()

    assignment = VehicleAssignment(
        vehicle_id=vehicle_id,
        instructor_id=new_instructor_id,
        assigned_from=transfer_date,
        assigned_until=end_date,
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)

    if update_future_lessons:
        result = await db.execute(
            select(ClientLesson).where(
                and_(
                    ClientLesson.vehicle_id == vehicle_id,
                    ClientLesson.scheduled_date.is_not(None),
                    ClientLesson.scheduled_date >= transfer_date,
                    ClientLesson.status.in_(["pending", "unlocked"]),
                )
            )
        )
        lessons = list(result.scalars().all())
        for lesson in lessons:
            lesson.instructor_id = new_instructor_id
        await db.flush()

    return assignment


async def delete_assignment(db: AsyncSession, assignment: VehicleAssignment) -> None:
    await db.delete(assignment)
    await db.flush()
