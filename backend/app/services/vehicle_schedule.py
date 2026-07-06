import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson_plan import (
    ClientLesson,
    VehicleScheduleSlot,
)


async def list_slots(
    db: AsyncSession,
    vehicle_id: uuid.UUID | None = None,
    instructor_id: str | None = None,
    day_of_week: int | None = None,
) -> list[VehicleScheduleSlot]:
    query = select(VehicleScheduleSlot).order_by(
        VehicleScheduleSlot.day_of_week, VehicleScheduleSlot.start_time
    )
    if vehicle_id:
        query = query.where(VehicleScheduleSlot.vehicle_id == vehicle_id)
    if instructor_id:
        query = query.where(VehicleScheduleSlot.instructor_id == instructor_id)
    if day_of_week is not None:
        query = query.where(VehicleScheduleSlot.day_of_week == day_of_week)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_slot_by_id(db: AsyncSession, slot_id: uuid.UUID) -> VehicleScheduleSlot | None:
    result = await db.execute(
        select(VehicleScheduleSlot).where(VehicleScheduleSlot.id == slot_id)
    )
    return result.scalar_one_or_none()


async def create_slot(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    instructor_id: str,
    day_of_week: int,
    start_time: str,
    end_time: str,
) -> VehicleScheduleSlot:
    slot = VehicleScheduleSlot(
        vehicle_id=vehicle_id,
        instructor_id=instructor_id,
        day_of_week=day_of_week,
        start_time=time.fromisoformat(start_time),
        end_time=time.fromisoformat(end_time),
    )
    db.add(slot)
    await db.flush()
    await db.refresh(slot)
    return slot


async def update_slot(
    db: AsyncSession,
    slot: VehicleScheduleSlot,
    instructor_id: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
) -> VehicleScheduleSlot:
    prev = {
        "day_of_week": slot.day_of_week,
        "start_time": slot.start_time.isoformat() if slot.start_time else "00:00",
        "end_time": slot.end_time.isoformat() if slot.end_time else "00:00",
    }
    if instructor_id is not None:
        slot.instructor_id = instructor_id
    if start_time is not None:
        slot.start_time = time.fromisoformat(start_time)
    if end_time is not None:
        slot.end_time = time.fromisoformat(end_time)
    await db.flush()
    # Propagate — use the new values
    await _propagate_instructor(db, slot.vehicle_id, [{
        "day_of_week": slot.day_of_week,
        "start_time": slot.start_time.isoformat() if slot.start_time else "00:00",
        "end_time": slot.end_time.isoformat() if slot.end_time else "00:00",
        "instructor_id": slot.instructor_id,
    }])
    await db.refresh(slot)
    return slot


async def delete_slot(db: AsyncSession, slot: VehicleScheduleSlot) -> None:
    vehicle_id = slot.vehicle_id
    day_of_week = slot.day_of_week
    start = slot.start_time.isoformat() if slot.start_time else "00:00"
    end = slot.end_time.isoformat() if slot.end_time else "00:00"
    await db.delete(slot)
    await db.flush()
    # Clear instructor on affected lessons
    await _propagate_instructor(db, vehicle_id, [{
        "day_of_week": day_of_week,
        "start_time": start,
        "end_time": end,
        "instructor_id": None,
    }])


async def _propagate_instructor(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    slots: list[dict],
) -> None:
    """Update instructor on locked ClientLesson records that match vehicle + day + time."""
    for s in slots:
        slot_start = time.fromisoformat(s["start_time"])
        slot_end = time.fromisoformat(s["end_time"])
        day_of_week = s["day_of_week"]
        new_instructor = s.get("instructor_id")

        # Find locked lessons using this vehicle whose scheduled date falls on this day_of_week
        # and whose scheduled time overlaps this slot
        result = await db.execute(
            select(ClientLesson).where(
                ClientLesson.vehicle_id == vehicle_id,
                ClientLesson.plan_locked_time.isnot(None),
                ClientLesson.scheduled_date.isnot(None),
                ClientLesson.scheduled_start_time < slot_end,
                ClientLesson.scheduled_end_time > slot_start,
            )
        )
        lessons = result.scalars().all()
        for lesson in lessons:
            if lesson.scheduled_date and lesson.scheduled_date.weekday() == day_of_week:
                lesson.instructor_id = new_instructor
    await db.flush()


async def bulk_set_schedule(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    slots: list[dict],
) -> list[VehicleScheduleSlot]:
    """Replace all schedule slots for a vehicle with a new set.
    Propagates instructor changes to existing locked ClientLesson records."""
    await db.execute(
        delete(VehicleScheduleSlot).where(VehicleScheduleSlot.vehicle_id == vehicle_id)
    )
    created = []
    for s in slots:
        slot = VehicleScheduleSlot(
            vehicle_id=vehicle_id,
            instructor_id=s["instructor_id"],
            day_of_week=s["day_of_week"],
            start_time=time.fromisoformat(s["start_time"]),
            end_time=time.fromisoformat(s["end_time"]),
        )
        db.add(slot)
        created.append(slot)
    await db.flush()

    # Propagate to locked client lessons
    await _propagate_instructor(db, vehicle_id, slots)

    for slot in created:
        await db.refresh(slot)
    return created


async def get_instructor_for_vehicle(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    day_of_week: int,
    at_time: time,
) -> str | None:
    """Find which instructor is assigned to a vehicle at a given day+time."""
    result = await db.execute(
        select(VehicleScheduleSlot).where(
            and_(
                VehicleScheduleSlot.vehicle_id == vehicle_id,
                VehicleScheduleSlot.day_of_week == day_of_week,
                VehicleScheduleSlot.start_time <= at_time,
                VehicleScheduleSlot.end_time > at_time,
            )
        ).limit(1)
    )
    slot = result.scalar_one_or_none()
    return slot.instructor_id if slot else None
