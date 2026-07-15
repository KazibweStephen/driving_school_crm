import uuid

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lesson_plan import (
    EntityStatus,
    LessonDifficulty,
    LessonLibrary,
    LessonLibraryVideo,
    LessonPrerequisite,
    TransmissionType,
    VideoLibrary,
)
from app.services.competency_catalogue import set_lesson_competencies, get_lesson_competencies


async def create_lesson(
    db: AsyncSession,
    title: str,
    description: str | None = None,
    transmission_type: str | None = None,
    lesson_objectives: list[str] | None = None,
    practical_objectives: list[str] | None = None,
    estimated_minutes: int = 30,
    estimated_distance_km: float = 3.0,
    required_vehicle: str | None = None,
    difficulty: str = "beginner",
    lesson_number: int | None = None,
    day_number: int | None = None,
    week_number: int | None = None,
    order: int | None = None,
    video_ids: list[uuid.UUID] | None = None,
    created_by_phone: str | None = None,
    preferred_location: str | None = None,
    training_category: str = "driving",
    prerequisite_lesson_ids: list[uuid.UUID] | None = None,
    is_theory: bool = False,
    company_id: uuid.UUID | None = None,
    competency_ids: list[uuid.UUID] | None = None,
) -> LessonLibrary:
    lesson = LessonLibrary(
        title=title,
        description=description,
        transmission_type=TransmissionType(transmission_type) if transmission_type else None,
        lesson_objectives=lesson_objectives or [],
        practical_objectives=practical_objectives or [],
        estimated_minutes=estimated_minutes,
        estimated_distance_km=estimated_distance_km,
        required_vehicle=required_vehicle,
        difficulty=LessonDifficulty(difficulty),
        lesson_number=lesson_number,
        day_number=day_number,
        week_number=week_number,
        order=order,
        created_by_phone=created_by_phone,
        preferred_location=preferred_location,
        training_category=training_category,
        is_theory=is_theory,
        company_id=company_id,
    )
    db.add(lesson)
    await db.flush()

    if video_ids:
        for idx, vid in enumerate(video_ids):
            link = LessonLibraryVideo(lesson_id=lesson.id, video_id=vid, order=idx)
            db.add(link)
        await db.flush()

    if prerequisite_lesson_ids:
        for prereq_id in prerequisite_lesson_ids:
            p = LessonPrerequisite(lesson_id=lesson.id, prerequisite_lesson_id=prereq_id)
            db.add(p)
        await db.flush()

    if competency_ids:
        links = [{"competency_id": cid, "order": idx} for idx, cid in enumerate(competency_ids)]
        await set_lesson_competencies(db, lesson.id, links)

    result = await db.execute(
        select(LessonLibrary)
        .where(LessonLibrary.id == lesson.id)
        .options(
            selectinload(LessonLibrary.videos),
            selectinload(LessonLibrary.prerequisite_lessons),
            selectinload(LessonLibrary.competency_links).selectinload(
                __import__('app.models.competency_catalogue', fromlist=['LessonCompetencyLink']).LessonCompetencyLink.competency
            ),
        )
    )
    return result.scalar_one()


async def get_lesson_by_id(db: AsyncSession, lesson_id: uuid.UUID, company_id: uuid.UUID | None = None) -> LessonLibrary | None:
    from app.models.competency_catalogue import LessonCompetencyLink, Competency, CompetencyCategory
    query = (
        select(LessonLibrary)
        .where(LessonLibrary.id == lesson_id)
        .options(
            selectinload(LessonLibrary.videos),
            selectinload(LessonLibrary.prerequisite_lessons),
        )
    )
    if company_id:
        query = query.where(LessonLibrary.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_lessons(
    db: AsyncSession,
    transmission_type: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
    search: str | None = None,
    company_id: uuid.UUID | None = None,
) -> list[LessonLibrary]:
    query = select(LessonLibrary).options(
        selectinload(LessonLibrary.videos),
        selectinload(LessonLibrary.prerequisite_lessons),
    )
    if company_id:
        query = query.where(LessonLibrary.company_id == company_id)
    if transmission_type:
        query = query.where(LessonLibrary.transmission_type == TransmissionType(transmission_type))
    if difficulty:
        query = query.where(LessonLibrary.difficulty == LessonDifficulty(difficulty))
    if status:
        query = query.where(LessonLibrary.status == EntityStatus(status))
    if search:
        query = query.where(LessonLibrary.title.ilike(f"%{search}%"))
    query = query.order_by(LessonLibrary.day_number.nullslast(), LessonLibrary.week_number.nullslast(), LessonLibrary.order.nullslast(), LessonLibrary.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_lesson(
    db: AsyncSession,
    lesson: LessonLibrary,
    title: str | None = None,
    description: str | None = None,
    transmission_type: str | None = None,
    lesson_objectives: list[str] | None = None,
    practical_objectives: list[str] | None = None,
    estimated_minutes: int | None = None,
    estimated_distance_km: float | None = None,
    required_vehicle: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
    lesson_number: int | None = None,
    day_number: int | None = None,
    week_number: int | None = None,
    order: int | None = None,
    preferred_location: str | None = None,
    training_category: str | None = None,
    prerequisite_lesson_ids: list[uuid.UUID] | None = None,
    is_theory: bool | None = None,
    competency_ids: list[uuid.UUID] | None = None,
) -> LessonLibrary:
    if title is not None:
        lesson.title = title
    if description is not None:
        lesson.description = description
    if transmission_type is not None:
        lesson.transmission_type = TransmissionType(transmission_type)
    if lesson_objectives is not None:
        lesson.lesson_objectives = lesson_objectives
    if practical_objectives is not None:
        lesson.practical_objectives = practical_objectives
    if estimated_minutes is not None:
        lesson.estimated_minutes = estimated_minutes
    if estimated_distance_km is not None:
        lesson.estimated_distance_km = estimated_distance_km
    if required_vehicle is not None:
        lesson.required_vehicle = required_vehicle
    if difficulty is not None:
        lesson.difficulty = LessonDifficulty(difficulty)
    if status is not None:
        lesson.status = EntityStatus(status)
    if lesson_number is not None:
        lesson.lesson_number = lesson_number
    if day_number is not None:
        lesson.day_number = day_number
    if week_number is not None:
        lesson.week_number = week_number
    if order is not None:
        lesson.order = order
    if preferred_location is not None:
        lesson.preferred_location = preferred_location
    if training_category is not None:
        lesson.training_category = training_category
    if prerequisite_lesson_ids is not None:
        await db.execute(
            delete(LessonPrerequisite).where(LessonPrerequisite.lesson_id == lesson.id)
        )
        for prereq_id in prerequisite_lesson_ids:
            p = LessonPrerequisite(lesson_id=lesson.id, prerequisite_lesson_id=prereq_id)
            db.add(p)
    if is_theory is not None:
        lesson.is_theory = is_theory
    if competency_ids is not None:
        links = [{"competency_id": cid, "order": idx} for idx, cid in enumerate(competency_ids)]
        await set_lesson_competencies(db, lesson.id, links)
    await db.flush()
    await db.refresh(lesson)
    return lesson


async def delete_lesson(db: AsyncSession, lesson: LessonLibrary) -> None:
    await db.delete(lesson)
    await db.flush()


async def attach_video(
    db: AsyncSession, lesson_id: uuid.UUID, video_id: uuid.UUID
) -> LessonLibraryVideo:
    link = LessonLibraryVideo(lesson_id=lesson_id, video_id=video_id)
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return link


async def detach_video(
    db: AsyncSession, lesson_id: uuid.UUID, video_id: uuid.UUID
) -> None:
    await db.execute(
        delete(LessonLibraryVideo)
        .where(LessonLibraryVideo.lesson_id == lesson_id)
        .where(LessonLibraryVideo.video_id == video_id)
    )
    await db.flush()
