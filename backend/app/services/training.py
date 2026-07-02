import math
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.training import Skill, TrainingSession
from app.schemas.training import TrainingSummary


async def create_training_session(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    session_date: datetime,
    duration_minutes: int = 120,
    theory_minutes: int | None = None,
    driving_minutes: int | None = None,
    notes: str | None = None,
    instructor_notes: str | None = None,
    video_url: str | None = None,
    skills: list[dict] | None = None,
) -> TrainingSession:
    session = TrainingSession(
        cart_item_id=cart_item_id,
        session_date=session_date,
        duration_minutes=duration_minutes,
        theory_minutes=theory_minutes,
        driving_minutes=driving_minutes,
        notes=notes,
        instructor_notes=instructor_notes,
        video_url=video_url,
    )
    db.add(session)
    await db.flush()

    if skills:
        for idx, sk in enumerate(skills):
            skill = Skill(
                training_session_id=session.id,
                name=sk.get("name", ""),
                description=sk.get("description"),
                competency_level=sk.get("competency_level", 1),
                order=sk.get("order", idx),
            )
            db.add(skill)
        await db.flush()

    result = await db.execute(
        select(TrainingSession).where(TrainingSession.id == session.id).options(selectinload(TrainingSession.skills))
    )
    session = result.scalar_one()
    return session


async def get_training_session_by_id(
    db: AsyncSession, session_id: uuid.UUID
) -> TrainingSession | None:
    result = await db.execute(
        select(TrainingSession)
        .where(TrainingSession.id == session_id)
        .options(selectinload(TrainingSession.skills))
    )
    return result.scalar_one_or_none()


async def list_training_sessions(
    db: AsyncSession, cart_item_id: uuid.UUID
) -> list[TrainingSession]:
    result = await db.execute(
        select(TrainingSession)
        .where(TrainingSession.cart_item_id == cart_item_id)
        .options(selectinload(TrainingSession.skills))
        .order_by(TrainingSession.session_date.asc())
    )
    return list(result.scalars().all())


async def _reload_with_skills(db: AsyncSession, session: TrainingSession) -> TrainingSession:
    result = await db.execute(
        select(TrainingSession).where(TrainingSession.id == session.id).options(selectinload(TrainingSession.skills))
    )
    return result.scalar_one()


async def update_training_session(
    db: AsyncSession,
    session: TrainingSession,
    session_date: datetime | None = None,
    duration_minutes: int | None = None,
    theory_minutes: int | None = None,
    driving_minutes: int | None = None,
    notes: str | None = None,
    instructor_notes: str | None = None,
    video_url: str | None = None,
    video_cached: bool | None = None,
    video_invalidated: bool | None = None,
    started_at: datetime | None = None,
    started_by: str | None = None,
    timer_seconds: int | None = None,
    timer_started_at: datetime | None = None,
) -> TrainingSession:
    if session_date is not None:
        session.session_date = session_date
    if duration_minutes is not None:
        session.duration_minutes = duration_minutes
    if theory_minutes is not None:
        session.theory_minutes = theory_minutes
    if driving_minutes is not None:
        session.driving_minutes = driving_minutes
    if notes is not None:
        session.notes = notes
    if instructor_notes is not None:
        session.instructor_notes = instructor_notes
    if video_url is not None:
        session.video_url = video_url
    if video_cached is not None:
        session.video_cached = video_cached
    if video_invalidated is not None:
        session.video_invalidated = video_invalidated
    if started_at is not None:
        session.started_at = started_at
    if started_by is not None:
        session.started_by = started_by
    if timer_seconds is not None:
        session.timer_seconds = timer_seconds
    if timer_started_at is not None:
        session.timer_started_at = timer_started_at
    await db.flush()
    return await _reload_with_skills(db, session)


async def delete_training_session(
    db: AsyncSession, session: TrainingSession
) -> None:
    await db.delete(session)
    await db.flush()


async def start_training_session(
    db: AsyncSession,
    session: TrainingSession,
    started_by: str,
) -> TrainingSession:
    now = datetime.utcnow()
    session.started_at = now
    session.started_by = started_by
    session.timer_started_at = now
    session.timer_seconds = 0
    await db.flush()
    return await _reload_with_skills(db, session)


async def update_timer(
    db: AsyncSession,
    session: TrainingSession,
    timer_seconds: int,
) -> TrainingSession:
    session.timer_seconds = timer_seconds
    await db.flush()
    return await _reload_with_skills(db, session)


async def invalidate_video(
    db: AsyncSession,
    session: TrainingSession,
) -> TrainingSession:
    session.video_invalidated = True
    session.video_cached = False
    await db.flush()
    return await _reload_with_skills(db, session)


async def mark_video_cached(
    db: AsyncSession,
    session: TrainingSession,
) -> TrainingSession:
    session.video_cached = True
    session.video_invalidated = False
    await db.flush()
    return await _reload_with_skills(db, session)


async def generate_sessions_from_package(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    start_date: datetime,
    driving_per_session_minutes: int = 120,
    theory_per_session_minutes: int = 60,
) -> list[TrainingSession]:
    cart_result = await db.execute(
        select(CartItem).where(CartItem.id == cart_item_id)
    )
    cart_item = cart_result.scalar_one_or_none()
    if not cart_item:
        raise ValueError("Cart item not found")

    expected_driving_min = (cart_item.driving_training_duration_days or 0) * 30
    expected_theory_min = (cart_item.theory_training_hours or 0) * 60
    total_duration_days = cart_item.driving_training_duration_days or 30

    created_sessions = []

    # Generate driving sessions
    if expected_driving_min > 0:
        count = max(1, math.ceil(expected_driving_min / driving_per_session_minutes))
        min_per_session = expected_driving_min // count
        remainder = expected_driving_min - (min_per_session * count)
        interval_days = max(1, total_duration_days // count) if count > 1 else 1

        for i in range(count):
            extra = 1 if i < remainder else 0
            session_date = start_date + timedelta(days=i * interval_days)
            session = TrainingSession(
                cart_item_id=cart_item_id,
                session_date=session_date,
                duration_minutes=driving_per_session_minutes,
                driving_minutes=min_per_session + extra,
                theory_minutes=0,
            )
            db.add(session)
            created_sessions.append(session)

    # Generate theory sessions
    if expected_theory_min > 0:
        count = max(1, math.ceil(expected_theory_min / theory_per_session_minutes))
        min_per_session = expected_theory_min // count
        remainder = expected_theory_min - (min_per_session * count)
        theory_interval = max(1, total_duration_days // count) if count > 1 else 1
        # Offset theory sessions after driving sessions or interleave
        offset = len(created_sessions) * 1  # start after last driving session day

        for i in range(count):
            extra = 1 if i < remainder else 0
            session_date = start_date + timedelta(days=offset + i * theory_interval)
            session = TrainingSession(
                cart_item_id=cart_item_id,
                session_date=session_date,
                duration_minutes=theory_per_session_minutes,
                driving_minutes=0,
                theory_minutes=min_per_session + extra,
            )
            db.add(session)
            created_sessions.append(session)

    await db.flush()
    loaded = []
    for s in created_sessions:
        result = await db.execute(
            select(TrainingSession).where(TrainingSession.id == s.id).options(selectinload(TrainingSession.skills))
        )
        loaded.append(result.scalar_one())
    return loaded


async def get_training_summary(
    db: AsyncSession, cart_item_id: uuid.UUID
) -> TrainingSummary:
    result = await db.execute(
        select(TrainingSession).where(TrainingSession.cart_item_id == cart_item_id)
    )
    sessions = list(result.scalars().all())

    total_driving = sum(s.driving_minutes or 0 for s in sessions)
    total_theory = sum(s.theory_minutes or 0 for s in sessions)

    cart_result = await db.execute(
        select(CartItem).where(CartItem.id == cart_item_id)
    )
    cart_item = cart_result.scalar_one_or_none()

    expected_driving = None
    expected_theory = None

    if cart_item:
        if cart_item.driving_training_duration_days:
            expected_driving = cart_item.driving_training_duration_days * 30
        if cart_item.theory_training_hours:
            expected_theory = cart_item.theory_training_hours * 60

    return TrainingSummary(
        total_driving_minutes=total_driving,
        total_theory_minutes=total_theory,
        sessions_count=len(sessions),
        expected_driving_minutes=expected_driving,
        expected_theory_minutes=expected_theory,
        driving_remaining_minutes=(
            max(0, expected_driving - total_driving) if expected_driving is not None else None
        ),
        theory_remaining_minutes=(
            max(0, expected_theory - total_theory) if expected_theory is not None else None
        ),
    )


# ── Skill CRUD ──


async def create_skill(
    db: AsyncSession,
    training_session_id: uuid.UUID,
    name: str,
    description: str | None = None,
    competency_level: int = 1,
    order: int = 0,
) -> Skill:
    skill = Skill(
        training_session_id=training_session_id,
        name=name,
        description=description,
        competency_level=competency_level,
        order=order,
    )
    db.add(skill)
    await db.flush()
    await db.refresh(skill)
    return skill


async def update_skill(
    db: AsyncSession,
    skill: Skill,
    name: str | None = None,
    description: str | None = None,
    competency_level: int | None = None,
    achieved: bool | None = None,
    order: int | None = None,
) -> Skill:
    if name is not None:
        skill.name = name
    if description is not None:
        skill.description = description
    if competency_level is not None:
        skill.competency_level = competency_level
    if achieved is not None:
        skill.achieved = achieved
    if order is not None:
        skill.order = order
    await db.flush()
    await db.refresh(skill)
    return skill


async def delete_skill(db: AsyncSession, skill: Skill) -> None:
    await db.delete(skill)
    await db.flush()


async def list_skills(
    db: AsyncSession, training_session_id: uuid.UUID
) -> list[Skill]:
    result = await db.execute(
        select(Skill)
        .where(Skill.training_session_id == training_session_id)
        .order_by(Skill.order)
    )
    return list(result.scalars().all())


async def get_skill_by_id(
    db: AsyncSession, skill_id: uuid.UUID
) -> Skill | None:
    result = await db.execute(
        select(Skill).where(Skill.id == skill_id)
    )
    return result.scalar_one_or_none()
