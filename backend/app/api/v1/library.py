import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import (
    LessonLibraryCreate,
    LessonLibraryRead,
    LessonLibraryUpdate,
)
from app.services import library as library_service
from app.services import competency_catalogue as comp_svc

router = APIRouter(tags=["lesson-library"])


async def _enrich_lesson_read(db: AsyncSession, lesson, competency_links: list[dict] | None = None):
    """Build LessonLibraryRead with competency_links from M2M."""
    read = LessonLibraryRead.model_validate(lesson)
    if competency_links is None:
        competency_links = await comp_svc.get_lesson_competencies(db, lesson.id)
    read.competency_links = competency_links
    return read


@router.get("/api/v1/lesson-library", response_model=list[LessonLibraryRead])
async def list_lessons(
    transmission_type: str | None = Query(None),
    difficulty: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lessons = await library_service.list_lessons(db, transmission_type, difficulty, status, search, company_id=current_user.company_id)
    result = []
    for l in lessons:
        links = await comp_svc.get_lesson_competencies(db, l.id)
        result.append(await _enrich_lesson_read(db, l, links))
    return result


@router.post("/api/v1/lesson-library", response_model=LessonLibraryRead, status_code=201)
async def create_lesson(
    data: LessonLibraryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = await library_service.create_lesson(
        db,
        title=data.title,
        description=data.description,
        transmission_type=data.transmission_type,
        lesson_objectives=data.lesson_objectives,
        practical_objectives=data.practical_objectives,
        estimated_minutes=data.estimated_minutes,
        estimated_distance_km=data.estimated_distance_km,
        required_vehicle=data.required_vehicle,
        difficulty=data.difficulty,
        lesson_number=data.lesson_number,
        day_number=data.day_number,
        week_number=data.week_number,
        order=data.order,
        video_ids=data.video_ids,
        created_by_phone=current_user.phone,
        preferred_location=data.preferred_location,
        training_category=data.training_category,
        prerequisite_lesson_ids=data.prerequisite_lesson_ids,
        is_theory=data.is_theory,
        company_id=current_user.company_id,
        competency_ids=data.competency_ids,
    )
    return await _enrich_lesson_read(db, lesson)


@router.get("/api/v1/lesson-library/{lesson_id}", response_model=LessonLibraryRead)
async def get_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await library_service.get_lesson_by_id(db, lid, company_id=current_user.company_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return await _enrich_lesson_read(db, lesson)


@router.patch("/api/v1/lesson-library/{lesson_id}", response_model=LessonLibraryRead)
async def update_lesson(
    lesson_id: str,
    data: LessonLibraryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await library_service.get_lesson_by_id(db, lid, company_id=current_user.company_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    updated = await library_service.update_lesson(
        db, lesson,
        title=data.title,
        description=data.description,
        transmission_type=data.transmission_type,
        lesson_objectives=data.lesson_objectives,
        practical_objectives=data.practical_objectives,
        estimated_minutes=data.estimated_minutes,
        estimated_distance_km=data.estimated_distance_km,
        required_vehicle=data.required_vehicle,
        difficulty=data.difficulty,
        status=data.status,
        lesson_number=data.lesson_number,
        day_number=data.day_number,
        week_number=data.week_number,
        order=data.order,
        preferred_location=data.preferred_location,
        training_category=data.training_category,
        prerequisite_lesson_ids=data.prerequisite_lesson_ids,
        is_theory=data.is_theory,
        competency_ids=data.competency_ids,
    )
    return await _enrich_lesson_read(db, updated)


@router.delete("/api/v1/lesson-library/{lesson_id}", status_code=204)
async def delete_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await library_service.get_lesson_by_id(db, lid, company_id=current_user.company_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await library_service.delete_lesson(db, lesson)


@router.post("/api/v1/lesson-library/{lesson_id}/videos/{video_id}", status_code=204)
async def attach_video(
    lesson_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
        vid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    await library_service.attach_video(db, lid, vid)


@router.delete("/api/v1/lesson-library/{lesson_id}/videos/{video_id}", status_code=204)
async def detach_video(
    lesson_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
        vid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    await library_service.detach_video(db, lid, vid)
