import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.training import (
    GenerateSessionsRequest,
    SkillCreate,
    SkillRead,
    SkillUpdate,
    TrainingSessionCreate,
    TrainingSessionRead,
    TrainingSessionUpdate,
    TrainingSummary,
)
from app.services import training as training_service

router = APIRouter(prefix="/cart-items", tags=["training"])


@router.get("/{cart_item_id}/training-sessions", response_model=list[TrainingSessionRead])
async def list_training_sessions(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    sessions = await training_service.list_training_sessions(db, cid)
    return [TrainingSessionRead.model_validate(s) for s in sessions]


@router.post("/{cart_item_id}/training-sessions", response_model=TrainingSessionRead, status_code=201)
async def create_training_session(
    cart_item_id: str,
    data: TrainingSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    skills_data = [s.model_dump() for s in data.skills] if data.skills else None
    session = await training_service.create_training_session(
        db, cid,
        session_date=data.session_date,
        duration_minutes=data.duration_minutes,
        theory_minutes=data.theory_minutes,
        driving_minutes=data.driving_minutes,
        notes=data.notes,
        instructor_notes=data.instructor_notes,
        video_url=data.video_url,
        skills=skills_data,
    )
    return TrainingSessionRead.model_validate(session)


@router.post("/{cart_item_id}/training-sessions/generate", response_model=list[TrainingSessionRead], status_code=201)
async def generate_training_sessions(
    cart_item_id: str,
    data: GenerateSessionsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    try:
        sessions = await training_service.generate_sessions_from_package(
            db, cid,
            start_date=data.start_date,
            driving_per_session_minutes=data.driving_per_session_minutes,
            theory_per_session_minutes=data.theory_per_session_minutes,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [TrainingSessionRead.model_validate(s) for s in sessions]


@router.get("/{cart_item_id}/training-summary", response_model=TrainingSummary)
async def get_training_summary(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    summary = await training_service.get_training_summary(db, cid)
    return summary


@router.patch("/training-sessions/{session_id}", response_model=TrainingSessionRead)
async def update_training_session(
    session_id: str,
    data: TrainingSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = await training_service.get_training_session_by_id(db, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    updated = await training_service.update_training_session(
        db, session,
        session_date=data.session_date,
        duration_minutes=data.duration_minutes,
        theory_minutes=data.theory_minutes,
        driving_minutes=data.driving_minutes,
        notes=data.notes,
        instructor_notes=data.instructor_notes,
        video_url=data.video_url,
    )
    return TrainingSessionRead.model_validate(updated)


@router.delete("/training-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_training_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = await training_service.get_training_session_by_id(db, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    await training_service.delete_training_session(db, session)


# ── Session start / timer / video ──


@router.post("/training-sessions/{session_id}/start", response_model=TrainingSessionRead)
async def start_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = await training_service.get_training_session_by_id(db, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    if session.started_at:
        raise HTTPException(status_code=400, detail="Session already started")
    updated = await training_service.start_training_session(db, session, started_by=current_user.phone)
    return TrainingSessionRead.model_validate(updated)


@router.patch("/training-sessions/{session_id}/timer", response_model=TrainingSessionRead)
async def update_timer(
    session_id: str,
    timer_seconds: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = await training_service.get_training_session_by_id(db, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    updated = await training_service.update_timer(db, session, timer_seconds)
    return TrainingSessionRead.model_validate(updated)


@router.post("/training-sessions/{session_id}/video/cache", response_model=TrainingSessionRead)
async def cache_video(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = await training_service.get_training_session_by_id(db, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    updated = await training_service.mark_video_cached(db, session)
    return TrainingSessionRead.model_validate(updated)


@router.post("/training-sessions/{session_id}/video/invalidate", response_model=TrainingSessionRead)
async def invalidate_video(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = await training_service.get_training_session_by_id(db, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    updated = await training_service.invalidate_video(db, session)
    return TrainingSessionRead.model_validate(updated)


# ── Skill CRUD ──


@router.get("/training-sessions/{session_id}/skills", response_model=list[SkillRead])
async def list_skills(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    skills = await training_service.list_skills(db, sid)
    return [SkillRead.model_validate(s) for s in skills]


@router.post("/training-sessions/{session_id}/skills", response_model=SkillRead, status_code=201)
async def create_skill(
    session_id: str,
    data: SkillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    skill = await training_service.create_skill(
        db, sid,
        name=data.name,
        description=data.description,
        competency_level=data.competency_level,
        order=data.order,
    )
    return SkillRead.model_validate(skill)


@router.patch("/training-sessions/skills/{skill_id}", response_model=SkillRead)
async def update_skill(
    skill_id: str,
    data: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(skill_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid skill ID")
    skill = await training_service.get_skill_by_id(db, sid)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    updated = await training_service.update_skill(
        db, skill,
        name=data.name,
        description=data.description,
        competency_level=data.competency_level,
        achieved=data.achieved,
        order=data.order,
    )
    return SkillRead.model_validate(updated)


@router.delete("/training-sessions/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(skill_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid skill ID")
    skill = await training_service.get_skill_by_id(db, sid)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    await training_service.delete_skill(db, skill)
