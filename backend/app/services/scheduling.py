import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.company import Branch
from app.models.consultation import Consultation
from app.models.lesson_plan import (
    ClientAvailability,
    ClientLesson,
    ClientLessonPlan,
    Vehicle,
)
from app.models.schedule_break import ScheduleBreak
from app.models.user import User, UserRole


# Operating hours: 6:00 AM to 7:00 PM = 26 half-hour slots total
# Active schedule breaks (e.g. lunch) are loaded from DB and reduce available slots
DAY_START = time(6, 0)
DAY_END = time(19, 0)
LUNCH_START = time(13, 0)
LUNCH_END = time(13, 30)
SLOT_MINUTES = 30


def _generate_slots(
    breaks: list[tuple[time, time]] | None = None,
    start: time | None = None,
    end: time | None = None,
) -> list[tuple[time, time]]:
    slots: list[tuple[time, time]] = []
    current = datetime.combine(date.today(), start or DAY_START)
    end_dt = datetime.combine(date.today(), end or DAY_END)
    breaks = breaks or []
    while current + timedelta(minutes=SLOT_MINUTES) <= end_dt:
        slot_start = current.time()
        slot_end = (current + timedelta(minutes=SLOT_MINUTES)).time()
        in_break = False
        for b_start, b_end in breaks:
            b_s = datetime.combine(date.today(), b_start)
            b_e = datetime.combine(date.today(), b_end)
            if current >= b_s and current < b_e:
                in_break = True
                break
        if in_break:
            current += timedelta(minutes=SLOT_MINUTES)
            continue
        slots.append((slot_start, slot_end))
        current += timedelta(minutes=SLOT_MINUTES)
    return slots


async def _get_active_breaks(
    db: AsyncSession, company_id: uuid.UUID | None = None
) -> list[tuple[time, time, bool]]:
    """Load active schedule breaks from DB, returning (start_time, end_time, is_standard)."""
    query = select(ScheduleBreak).where(ScheduleBreak.is_active == True)
    if company_id:
        query = query.where(ScheduleBreak.company_id == company_id)
    result = await db.execute(query)
    return [(b.start_time, b.end_time, b.is_standard) for b in result.scalars().all()]


async def _is_vehicle_full_in_half(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    date_: date,
    half_start: time,
    half_end: time,
    standard_breaks: list[tuple[time, time]] | None = None,
) -> bool:
    """Check if a vehicle has all possible slots booked in a half-day period."""
    count_result = await db.execute(
        select(func.count()).select_from(ClientLesson).where(
            ClientLesson.vehicle_id == vehicle_id,
            ClientLesson.scheduled_date == date_,
            ClientLesson.is_active == True,
            ClientLesson.status.notin_(["cancelled", "skipped"]),
            ClientLesson.scheduled_start_time >= half_start,
            ClientLesson.scheduled_start_time < half_end,
        )
    )
    existing = count_result.scalar() or 0
    total_slots = len(_generate_slots(standard_breaks or [], start=half_start, end=half_end))
    return existing >= total_slots


async def _is_instructor_full_in_half(
    db: AsyncSession,
    instructor_id: str,
    date_: date,
    half_start: time,
    half_end: time,
    standard_breaks: list[tuple[time, time]] | None = None,
) -> bool:
    """Check if an instructor has all possible slots booked in a half-day period."""
    count_result = await db.execute(
        select(func.count()).select_from(ClientLesson).where(
            ClientLesson.instructor_id == instructor_id,
            ClientLesson.scheduled_date == date_,
            ClientLesson.is_active == True,
            ClientLesson.status.notin_(["cancelled", "skipped"]),
            ClientLesson.scheduled_start_time >= half_start,
            ClientLesson.scheduled_start_time < half_end,
        )
    )
    existing = count_result.scalar() or 0
    total_slots = len(_generate_slots(standard_breaks or [], start=half_start, end=half_end))
    return existing >= total_slots


async def _get_enforced_breaks(
    db: AsyncSession,
    vehicle_id: uuid.UUID | None = None,
    date_: date | None = None,
    company_id: uuid.UUID | None = None,
) -> list[tuple[time, time]]:
    """Get active breaks that are enforced for a given vehicle+date.

    Standard breaks (e.g. lunch) are always enforced.
    Non-standard breaks are only enforced if the vehicle is fully booked
    in the relevant half-day (morning or afternoon).
    When no vehicle/date context is provided, ALL breaks are enforced (conservative).
    """
    active = await _get_active_breaks(db, company_id=company_id)
    # active returns (start_time, end_time, is_standard)

    # If no vehicle/date context, enforce all breaks
    if vehicle_id is None or date_ is None:
        return [(b[0], b[1]) for b in active]

    standard = []
    non_standard = []
    for start_t, end_t, is_std in active:
        if is_std:
            standard.append((start_t, end_t))
        else:
            non_standard.append((start_t, end_t))

    enforced = list(standard)

    # Morning non-standard breaks: enforce if vehicle full in morning
    morning_non_std = [b for b in non_standard if b[0] < LUNCH_START]
    if morning_non_std:
        morning_full = await _is_vehicle_full_in_half(db, vehicle_id, date_, DAY_START, LUNCH_START, standard)
        if morning_full:
            enforced.extend(morning_non_std)

    # Afternoon non-standard breaks: enforce if vehicle full in afternoon
    afternoon_non_std = [b for b in non_standard if b[0] >= LUNCH_END]
    if afternoon_non_std:
        afternoon_full = await _is_vehicle_full_in_half(db, vehicle_id, date_, LUNCH_END, DAY_END, standard)
        if afternoon_full:
            enforced.extend(afternoon_non_std)

    return enforced


async def _get_instructor_enforced_breaks(
    db: AsyncSession,
    instructor_id: str | None = None,
    date_: date | None = None,
    company_id: uuid.UUID | None = None,
) -> list[tuple[time, time]]:
    """Get active breaks enforced for a given instructor+date.

    Standard breaks always enforced. Non-standard breaks only enforced
    if the instructor is fully booked in that half-day.
    When no instructor/date context, all breaks enforced (conservative).
    """
    active = await _get_active_breaks(db, company_id=company_id)

    if instructor_id is None or date_ is None:
        return [(b[0], b[1]) for b in active]

    standard = []
    non_standard = []
    for start_t, end_t, is_std in active:
        if is_std:
            standard.append((start_t, end_t))
        else:
            non_standard.append((start_t, end_t))

    enforced = list(standard)

    morning_non_std = [b for b in non_standard if b[0] < LUNCH_START]
    if morning_non_std:
        full = await _is_instructor_full_in_half(db, instructor_id, date_, DAY_START, LUNCH_START, standard)
        if full:
            enforced.extend(morning_non_std)

    afternoon_non_std = [b for b in non_standard if b[0] >= LUNCH_END]
    if afternoon_non_std:
        full = await _is_instructor_full_in_half(db, instructor_id, date_, LUNCH_END, DAY_END, standard)
        if full:
            enforced.extend(afternoon_non_std)

    return enforced


async def create_availability(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    day_of_week: int,
    start_time: str,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientAvailability:
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        result = await db.execute(
            select(CartItem).where(CartItem.id == cart_item_id)
        )
        ci = result.scalar_one_or_none()
        if not ci:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Cart item not found")
        consult_result = await db.execute(select(Consultation).where(Consultation.id == ci.consultation_id))
        consult = consult_result.scalar_one_or_none()
        if not consult:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Consultation not found")
        branch_result = await db.execute(select(Branch).where(Branch.id == consult.branch_id))
        branch = branch_result.scalar_one_or_none()
        if not branch or branch.company_id != company_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Cart item not found")
    avail = ClientAvailability(
        cart_item_id=cart_item_id,
        day_of_week=day_of_week,
        start_time=time.fromisoformat(start_time),
    )
    db.add(avail)
    await db.flush()
    return avail


async def list_availability(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[ClientAvailability]:
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        result = await db.execute(
            select(CartItem).where(CartItem.id == cart_item_id)
        )
        ci = result.scalar_one_or_none()
        if not ci:
            return []
        consult_result = await db.execute(select(Consultation).where(Consultation.id == ci.consultation_id))
        consult = consult_result.scalar_one_or_none()
        if not consult:
            return []
        branch_result = await db.execute(select(Branch).where(Branch.id == consult.branch_id))
        branch = branch_result.scalar_one_or_none()
        if not branch or branch.company_id != company_id:
            return []
    result = await db.execute(
        select(ClientAvailability).where(
            ClientAvailability.cart_item_id == cart_item_id
        )
    )
    return list(result.scalars().all())


async def update_availability(
    db: AsyncSession, avail_id: uuid.UUID, **kwargs
) -> ClientAvailability | None:
    query = select(ClientAvailability).where(ClientAvailability.id == avail_id)
    company_id = kwargs.pop("company_id", None)
    current_user_role = kwargs.pop("current_user_role", None)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = (query.join(CartItem, ClientAvailability.cart_item_id == CartItem.id)
                 .join(Consultation, CartItem.consultation_id == Consultation.id)
                 .join(Branch, Consultation.branch_id == Branch.id)
                 .where(Branch.company_id == company_id))
    result = await db.execute(query)
    avail = result.scalar_one_or_none()
    if not avail:
        return None
    if "day_of_week" in kwargs:
        avail.day_of_week = kwargs["day_of_week"]
    if "start_time" in kwargs:
        avail.start_time = time.fromisoformat(kwargs["start_time"])
    await db.flush()
    return avail


async def delete_availability(db: AsyncSession, avail_id: uuid.UUID, company_id: uuid.UUID | None = None, current_user_role: UserRole | None = None) -> bool:
    query = select(ClientAvailability).where(ClientAvailability.id == avail_id)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = (query.join(CartItem, ClientAvailability.cart_item_id == CartItem.id)
                 .join(Consultation, CartItem.consultation_id == Consultation.id)
                 .join(Branch, Consultation.branch_id == Branch.id)
                 .where(Branch.company_id == company_id))
    result = await db.execute(query)
    avail = result.scalar_one_or_none()
    if not avail:
        return False
    await db.delete(avail)
    await db.flush()
    return True


async def get_instructor_schedule(
    db: AsyncSession, instructor_id: str, on_date: date
) -> list[dict]:
    result = await db.execute(
        select(ClientLesson)
        .join(ClientLesson.plan)
        .join(ClientLessonPlan.cart_item)
        .join(CartItem.consultation)
        .where(
            ClientLesson.instructor_id == instructor_id,
            ClientLesson.scheduled_date == on_date,
            ClientLesson.is_active == True,
        )
        .options(
            selectinload(ClientLesson.plan).selectinload(ClientLessonPlan.cart_item)
        )
    )
    lessons = result.scalars().all()
    slots = []
    for lesson in lessons:
        slots.append(
            {
                "lesson_id": lesson.id,
                "title": lesson.title,
                "scheduled_date": (
                    lesson.scheduled_date.isoformat()
                    if lesson.scheduled_date
                    else None
                ),
                "scheduled_start_time": lesson.scheduled_start_time,
                "scheduled_end_time": lesson.scheduled_end_time,
                "duration_minutes": lesson.duration_minutes,
                "instructor_id": lesson.instructor_id,
                "vehicle_id": lesson.vehicle_id,
                "transmission": None,
                "status": lesson.status.value if lesson.status else None,
                "client_name": (
                    f"{lesson.plan.cart_item.consultation.first_name} "
                    f"{lesson.plan.cart_item.consultation.last_name}"
                    if lesson.plan and lesson.plan.cart_item and lesson.plan.cart_item.consultation
                    else "Unknown"
                ),
            }
        )
    return slots


async def detect_collisions(
    db: AsyncSession, instructor_id: str, on_date: date, proposed_start: time, proposed_end: time
) -> list[dict]:
    result = await db.execute(
        select(ClientLesson).where(
            ClientLesson.instructor_id == instructor_id,
            ClientLesson.scheduled_date == on_date,
            ClientLesson.scheduled_start_time < proposed_end,
            ClientLesson.scheduled_end_time > proposed_start,
            ClientLesson.is_active == True,
            ClientLesson.status.notin_(["cancelled", "skipped"]),
        )
    )
    collisions = result.scalars().all()
    return [
        {
            "lesson_id": str(c.id),
            "title": c.title,
            "scheduled_start_time": (
                c.scheduled_start_time.isoformat() if c.scheduled_start_time else None
            ),
            "scheduled_end_time": (
                c.scheduled_end_time.isoformat() if c.scheduled_end_time else None
            ),
        }
        for c in collisions
    ]


async def _get_booked_times(
    db: AsyncSession, instructor_id: str, on_date: date
) -> list[tuple[time, time]]:
    """Get instructor's already-booked time slots for a given date."""
    booked = await db.execute(
        select(ClientLesson.scheduled_start_time, ClientLesson.scheduled_end_time).where(
            ClientLesson.instructor_id == instructor_id,
            ClientLesson.scheduled_date == on_date,
            ClientLesson.is_active == True,
            ClientLesson.status.notin_(["cancelled", "skipped"]),
        )
    )
    return [(row[0], row[1]) for row in booked.all() if row[0] and row[1]]


def _is_slot_free(
    slot_start: time, slot_end: time, booked_times: list[tuple[time, time]]
) -> bool:
    """Check if a 30-min slot does not collide with any booked time."""
    for b_start, b_end in booked_times:
        if slot_start < b_end and slot_end > b_start:
            return False
    return True


async def check_preferred_times(
    db: AsyncSession,
    instructor_id: str,
    on_date: date,
    preferred_times: list[time],
    breaks: list[tuple[time, time]] | None = None,
    vehicle_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
) -> tuple[time, time, time] | None:
    """
    Try each preferred start time in order.
    Returns (start_time, end_time, preferred_start_time) if a slot is free,
    or None if none of the preferred times work.
    Skips active schedule breaks — uses vehicle-aware enforcement when
    vehicle_id is provided.
    Also enforces instructor daily capacity (max slots per day derived
    from operating hours minus instructor-enforced breaks).
    """
    if on_date.weekday() > 4:
        return None  # Weekends not allowed

    # Load breaks with vehicle awareness
    if vehicle_id is not None:
        breaks = await _get_enforced_breaks(db, vehicle_id, on_date, company_id=company_id)
    breaks = breaks or []

    # Instructor daily capacity check
    instructor_breaks = await _get_instructor_enforced_breaks(db, instructor_id, on_date, company_id=company_id)
    instructor_slots = _generate_slots(instructor_breaks)
    instructor_max = len(instructor_slots)
    existing = await _check_instructor_capacity(db, instructor_id, on_date)
    if existing >= instructor_max:
        return None  # Instructor already at capacity for this day

    booked = await _get_booked_times(db, instructor_id, on_date)

    def _in_break(t: time) -> bool:
        for b_start, b_end in breaks:
            if b_start <= t < b_end:
                return True
        return False

    for pref_time in preferred_times:
        if _in_break(pref_time):
            continue
        slot_end_dt = datetime.combine(on_date, pref_time) + timedelta(minutes=SLOT_MINUTES)
        slot_end = slot_end_dt.time()
        if _in_break(slot_end):
            continue
        if _is_slot_free(pref_time, slot_end, booked):
            return (pref_time, slot_end, pref_time)

    return None


async def find_and_lock_schedule(
    db: AsyncSession,
    plan_id: uuid.UUID,
    instructor_id: str,
    start_date: date,
    preferred_times: list[str],
    vehicle_id: uuid.UUID | None = None,
    duration_minutes: int = 30,
    instructor_id_auto: str | None = None,
    vehicle_id_auto: uuid.UUID | None = None,
    manual_days: int | None = None,
    company_id: uuid.UUID | None = None,
) -> dict:
    """
    Try each preferred start time on start_date.
    - If a free slot is found: lock all lessons in the plan → return {"locked": True, …}
    - If none: return the instructor's full day schedule with collisions highlighted.
    """
    # Use the primary vehicle for break enforcement during the initial check;
    # the manual-phase vehicle is the most relevant for the first day
    check_vehicle = vehicle_id or vehicle_id_auto
    breaks = await _get_enforced_breaks(db, check_vehicle, start_date, company_id=company_id)

    preferred = [time.fromisoformat(t) for t in preferred_times]

    result = await check_preferred_times(
        db, instructor_id, start_date, preferred, breaks=breaks, vehicle_id=check_vehicle,
        company_id=company_id,
    )

    if result:
        found_start, found_end, _ = result
        locked = await lock_schedule(
            db,
            plan_id,
            found_start,
            duration_minutes=duration_minutes,
            instructor_id=instructor_id,
            vehicle_id=vehicle_id,
            start_date=start_date,
            instructor_id_auto=instructor_id_auto,
            vehicle_id_auto=vehicle_id_auto,
            manual_days=manual_days,
            company_id=company_id,
        )
        return {
            "locked": True,
            "start_time": found_start.isoformat(),
            "end_time": found_end.isoformat(),
            "lessons_locked": len(locked),
        }

    all_breaks = [b for b in breaks]  # full list for display
    full_day = await get_full_day_schedule(db, instructor_id, start_date, breaks=all_breaks, company_id=company_id)
    return {
        "locked": False,
        "schedule": full_day,
        "message": "None of the preferred times are available. Review the schedule below.",
    }


async def _check_vehicle_capacity(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    on_date: date,
    exclude_plan_id: uuid.UUID | None = None,
) -> int:
    """Count how many active lessons are assigned to a vehicle on a given date."""
    query = select(func.count()).select_from(ClientLesson).where(
        ClientLesson.vehicle_id == vehicle_id,
        ClientLesson.scheduled_date == on_date,
        ClientLesson.is_active == True,
        ClientLesson.status.notin_(["cancelled", "skipped"]),
    )
    if exclude_plan_id:
        query = query.where(ClientLesson.lesson_plan_id != exclude_plan_id)
    result = await db.execute(query)
    return result.scalar() or 0


async def _check_instructor_capacity(
    db: AsyncSession,
    instructor_id: str,
    on_date: date,
    exclude_plan_id: uuid.UUID | None = None,
) -> int:
    """Count how many active lessons are assigned to an instructor on a given date."""
    query = select(func.count()).select_from(ClientLesson).where(
        ClientLesson.instructor_id == instructor_id,
        ClientLesson.scheduled_date == on_date,
        ClientLesson.is_active == True,
        ClientLesson.status.notin_(["cancelled", "skipped"]),
    )
    if exclude_plan_id:
        query = query.where(ClientLesson.lesson_plan_id != exclude_plan_id)
    result = await db.execute(query)
    return result.scalar() or 0


async def lock_schedule(
    db: AsyncSession,
    plan_id: uuid.UUID,
    start_time: time,
    duration_minutes: int = 30,
    instructor_id: str | None = None,
    vehicle_id: uuid.UUID | None = None,
    start_date: date | None = None,
    instructor_id_auto: str | None = None,
    vehicle_id_auto: uuid.UUID | None = None,
    manual_days: int | None = None,
    breaks: list[tuple[time, time]] | None = None,
    company_id: uuid.UUID | None = None,
) -> list[ClientLesson]:
    """Lock all future lessons in a plan to the same daily time slot.

    Each lesson's scheduled_date is computed as start_date + lesson.day_number - 1
    so lessons land on consecutive weekdays (skipping weekends automatically
    via day_number ordering).

    Supports dual-phase transmission training:
    - Lessons with day_number <= manual_days get the manual-phase vehicle/instructor
    - Lessons with day_number > manual_days get the auto-phase vehicle/instructor

    Enforces:
    - No scheduling during enforced break times (standard always; conditional
      on vehicle capacity for non-standard breaks)
    - Max sessions per vehicle per day derived from operating hours minus
      enforced breaks
    """
    breaks = breaks or []

    def _in_break(t: time) -> bool:
        for b_start, b_end in breaks:
            if b_start <= t < b_end:
                return True
        return False

    result = await db.execute(
        select(ClientLesson).where(
            ClientLesson.lesson_plan_id == plan_id,
            ClientLesson.is_active == True,
        ).order_by(ClientLesson.day_number)
    )
    lessons = list(result.scalars().all())
    if not lessons:
        raise ValueError("No active lessons found for this plan")

    # Use override manual_days or read from plan, then save override if provided
    plan_result = await db.execute(
        select(ClientLessonPlan).where(ClientLessonPlan.id == plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError("Lesson plan not found")
    md = manual_days if manual_days is not None else plan.manual_days
    if manual_days is not None and plan.manual_days != manual_days:
        plan.manual_days = manual_days

    if duration_minutes > 30:
        raise ValueError("Duration cannot exceed 30 minutes per lesson")

    end_dt = datetime.combine(date.today(), start_time) + timedelta(minutes=duration_minutes)
    end_time = end_dt.time()

    # Validate against active breaks
    if _in_break(start_time):
        break_names = ", ".join(f"{b[0].isoformat()}-{b[1].isoformat()}" for b in breaks)
        raise ValueError(f"Cannot schedule during break time ({break_names})")
    if _in_break(end_time):
        break_names = ", ".join(f"{b[0].isoformat()}-{b[1].isoformat()}" for b in breaks)
        raise ValueError(f"Cannot schedule during break time ({break_names})")

    # Validate vehicle capacity: per-vehicle per-date with vehicle-aware breaks
    vehicle_date_counts: dict[tuple[uuid.UUID, date], int] = {}
    # Validate instructor capacity: per-instructor per-date with instructor-enforced breaks
    instructor_date_counts: dict[tuple[str, date], int] = {}
    for lesson in lessons:
        if not start_date:
            continue
        lesson_date = start_date + timedelta(days=lesson.day_number - 1)

        is_manual_phase = md and lesson.day_number <= md
        v_id = None
        i_id = None
        if is_manual_phase:
            v_id = vehicle_id
            i_id = instructor_id
        else:
            v_id = vehicle_id_auto or vehicle_id
            i_id = instructor_id_auto or instructor_id

        if v_id is not None:
            v_key = (v_id, lesson_date)
            if v_key not in vehicle_date_counts:
                vehicle_breaks = await _get_enforced_breaks(db, v_id, lesson_date, company_id=company_id)
                vehicle_slots = _generate_slots(vehicle_breaks)
                vehicle_max = len(vehicle_slots)
                existing = await _check_vehicle_capacity(db, v_id, lesson_date, exclude_plan_id=plan_id)
                vehicle_date_counts[v_key] = (existing, vehicle_max)

            count, vehicle_max = vehicle_date_counts[v_key]
            count += 1
            vehicle_date_counts[v_key] = (count, vehicle_max)
            if count > vehicle_max:
                raise ValueError(
                    f"Vehicle would exceed {vehicle_max} training sessions on {lesson_date}. "
                    f"Already has {count - 1} sessions scheduled."
                )

        if i_id is not None:
            i_key = (i_id, lesson_date)
            if i_key not in instructor_date_counts:
                instr_breaks = await _get_instructor_enforced_breaks(db, i_id, lesson_date, company_id=company_id)
                instr_slots = _generate_slots(instr_breaks)
                instr_max = len(instr_slots)
                existing = await _check_instructor_capacity(db, i_id, lesson_date, exclude_plan_id=plan_id)
                instructor_date_counts[i_key] = (existing, instr_max)

            count, i_max = instructor_date_counts[i_key]
            count += 1
            instructor_date_counts[i_key] = (count, i_max)
            if count > i_max:
                raise ValueError(
                    f"Instructor would exceed {i_max} training sessions on {lesson_date}. "
                    f"Already has {count - 1} sessions scheduled."
                )

    for lesson in lessons:
        if start_date:
            lesson.scheduled_date = start_date + timedelta(days=lesson.day_number - 1)
        lesson.scheduled_start_time = start_time
        lesson.scheduled_end_time = end_time
        lesson.duration_minutes = duration_minutes
        lesson.plan_locked_time = start_time

        is_manual_phase = md and lesson.day_number <= md
        if is_manual_phase:
            if instructor_id:
                lesson.instructor_id = instructor_id
            if vehicle_id:
                lesson.vehicle_id = vehicle_id
        else:
            if instructor_id_auto:
                lesson.instructor_id = instructor_id_auto
            elif instructor_id:
                lesson.instructor_id = instructor_id
            if vehicle_id_auto:
                lesson.vehicle_id = vehicle_id_auto
            elif vehicle_id:
                lesson.vehicle_id = vehicle_id

    await db.flush()
    return lessons


async def get_full_day_schedule(
    db: AsyncSession, instructor_id: str, on_date: date,
    breaks: list[tuple[time, time]] | None = None,
    company_id: uuid.UUID | None = None,
) -> dict:
    """Get full day schedule with collision highlighting."""
    if breaks is None:
        active = await _get_active_breaks(db, company_id=company_id)
        breaks = [(b[0], b[1]) for b in active]
    slots = await get_instructor_schedule(db, instructor_id, on_date)
    # Build list of all 30-min slots showing occupied/free
    booked_times = await _get_booked_times(db, instructor_id, on_date)
    all_slots_list = _generate_slots(breaks)
    slot_statuses = []
    for s_start, s_end in all_slots_list:
        busy = not _is_slot_free(s_start, s_end, booked_times)
        slot_statuses.append({
            "start_time": s_start.isoformat(),
            "end_time": s_end.isoformat(),
            "busy": busy,
        })

    # Detect overbooked slots
    time_map: dict[str, list] = {}
    for s in slots:
        key = f"{s['scheduled_start_time']}-{s['scheduled_end_time']}"
        if key not in time_map:
            time_map[key] = []
        time_map[key].append(s)

    collisions = []
    for key, items in time_map.items():
        if len(items) > 1:
            collisions.append(
                {"time_slot": key, "lessons": items, "count": len(items)}
            )

    return {
        "date": on_date.isoformat(),
        "slots": slots,
        "all_slots": all_slots_list,
        "breaks": [{"start_time": b[0].isoformat(), "end_time": b[1].isoformat()} for b in breaks],
        "collisions": collisions,
    }


async def get_weekly_schedule(
    db: AsyncSession, start_date: date,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[dict]:
    """Get all scheduled lessons for a week (start_date to start_date+6)."""
    end_date = start_date + timedelta(days=6)
    query = (
        select(ClientLesson)
        .join(ClientLesson.plan)
        .join(ClientLessonPlan.cart_item)
        .join(CartItem.consultation)
        .where(
            ClientLesson.scheduled_date.between(start_date, end_date),
            ClientLesson.is_active == True,
            ClientLesson.scheduled_start_time.isnot(None),
        )
    )
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    query = query.options(
        selectinload(ClientLesson.plan)
        .selectinload(ClientLessonPlan.cart_item)
        .selectinload(CartItem.consultation),
        selectinload(ClientLesson.vehicle),
    ).order_by(ClientLesson.scheduled_date, ClientLesson.scheduled_start_time)
    result = await db.execute(query)
    lessons = result.scalars().all()

    # Collect unique instructor IDs for User lookup
    instructor_ids = set()
    vehicle_ids = set()
    for lesson in lessons:
        if lesson.instructor_id:
            instructor_ids.add(lesson.instructor_id)
        if lesson.vehicle_id:
            vehicle_ids.add(lesson.vehicle_id)

    # Fetch instructor names
    instructors: dict[str, str] = {}
    if instructor_ids:
        user_result = await db.execute(
            select(User).where(User.phone.in_(instructor_ids))
        )
        for u in user_result.scalars().all():
            instructors[u.phone] = u.name

    # Fetch vehicle details
    vehicles: dict[uuid.UUID, dict] = {}
    if vehicle_ids:
        veh_result = await db.execute(
            select(Vehicle).where(Vehicle.id.in_(vehicle_ids))
        )
        for v in veh_result.scalars().all():
            vehicles[v.id] = {"name": v.name, "plate": v.plate_number, "transmission": v.transmission.value if v.transmission else None}

    days = [start_date + timedelta(days=i) for i in range(7)]
    slots = []
    for lesson in lessons:
        client_name = (
            f"{lesson.plan.cart_item.consultation.first_name} "
            f"{lesson.plan.cart_item.consultation.last_name}"
            if lesson.plan and lesson.plan.cart_item and lesson.plan.cart_item.consultation
            else "Unknown"
        )
        veh = vehicles.get(lesson.vehicle_id) if lesson.vehicle_id else None
        slots.append({
            "lesson_id": lesson.id,
            "client_name": client_name.strip(),
            "title": lesson.title,
            "scheduled_date": lesson.scheduled_date,
            "scheduled_start_time": lesson.scheduled_start_time,
            "scheduled_end_time": lesson.scheduled_end_time,
            "duration_minutes": lesson.duration_minutes,
            "instructor_id": lesson.instructor_id,
            "instructor_name": instructors.get(lesson.instructor_id) if lesson.instructor_id else None,
            "vehicle_id": lesson.vehicle_id,
            "vehicle_name": veh["name"] if veh else None,
            "vehicle_plate": veh["plate"] if veh else None,
            "transmission": veh["transmission"] if veh else None,
            "status": lesson.status.value if lesson.status else None,
        })
    return {"start_date": start_date, "days": days, "slots": slots}
