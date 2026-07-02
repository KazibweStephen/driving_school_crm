import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.lesson_plan import (
    ClientLesson,
    ClientLessonChecklist,
    ClientLessonCompetency,
    ClientLessonPlan,
    ClientLessonTimer,
    ChecklistType,
    CompetencyProgress,
    LessonState,
    TheorySession,
    TheorySessionStatus,
    LessonHistory,
)
from app.models.user import User
from app.schemas.lesson_plan import (
    ClientLessonChecklistCreate,
    ClientLessonChecklistRead,
    ClientLessonChecklistUpdate,
    ClientLessonCompetencyCreate,
    ClientLessonCompetencyRead,
    ClientLessonCompetencyUpdate,
    ClientLessonTimerRead,
    ClientLessonTimerSync,
    TheorySessionCreate,
    TheorySessionGenerateRequest,
    TheorySessionRead,
    TheorySessionUpdate,
)

router = APIRouter(tags=["lesson-execution"])


# ═══════════════════════════════════════════
# Checklists
# ═══════════════════════════════════════════


@router.get("/api/v1/lessons/{lesson_id}/checklists", response_model=list[ClientLessonChecklistRead])
async def list_checklists(
    lesson_id: str,
    checklist_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    query = select(ClientLessonChecklist).where(ClientLessonChecklist.client_lesson_id == lid)
    if checklist_type:
        query = query.where(ClientLessonChecklist.checklist_type == ChecklistType(checklist_type))
    query = query.order_by(ClientLessonChecklist.order)
    result = await db.execute(query)
    items = list(result.scalars().all())
    return [ClientLessonChecklistRead.model_validate(i) for i in items]


@router.post("/api/v1/lessons/{lesson_id}/checklists", response_model=ClientLessonChecklistRead, status_code=201)
async def create_checklist_item(
    lesson_id: str,
    data: ClientLessonChecklistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    item = ClientLessonChecklist(
        client_lesson_id=lid,
        checklist_type=ChecklistType(data.checklist_type),
        item_label=data.item_label,
        order=data.order,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return ClientLessonChecklistRead.model_validate(item)


@router.patch("/api/v1/lessons/checklists/{item_id}", response_model=ClientLessonChecklistRead)
async def update_checklist_item(
    item_id: str,
    data: ClientLessonChecklistUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    result = await db.execute(select(ClientLessonChecklist).where(ClientLessonChecklist.id == iid))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    if data.item_label is not None:
        item.item_label = data.item_label
    if data.is_checked is not None:
        item.is_checked = data.is_checked
        item.checked_by = current_user.phone if data.is_checked else None
        item.checked_at = datetime.utcnow() if data.is_checked else None
    if data.order is not None:
        item.order = data.order
    await db.flush()
    await db.refresh(item)
    return ClientLessonChecklistRead.model_validate(item)


@router.delete("/api/v1/lessons/checklists/{item_id}", status_code=204)
async def delete_checklist_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    result = await db.execute(select(ClientLessonChecklist).where(ClientLessonChecklist.id == iid))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    await db.delete(item)
    await db.flush()


# ═══════════════════════════════════════════
# Competencies
# ═══════════════════════════════════════════


@router.get("/api/v1/lessons/{lesson_id}/competencies", response_model=list[ClientLessonCompetencyRead])
async def list_competencies(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    result = await db.execute(
        select(ClientLessonCompetency)
        .where(ClientLessonCompetency.client_lesson_id == lid)
        .order_by(ClientLessonCompetency.order)
    )
    items = list(result.scalars().all())
    return [ClientLessonCompetencyRead.model_validate(i) for i in items]


@router.post("/api/v1/lessons/{lesson_id}/competencies", response_model=ClientLessonCompetencyRead, status_code=201)
async def create_competency(
    lesson_id: str,
    data: ClientLessonCompetencyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    comp = ClientLessonCompetency(
        client_lesson_id=lid,
        competency_name=data.competency_name,
        level=CompetencyProgress(data.level),
        notes=data.notes,
        order=data.order,
    )
    db.add(comp)
    await db.flush()
    await db.refresh(comp)
    return ClientLessonCompetencyRead.model_validate(comp)


@router.patch("/api/v1/lessons/competencies/{competency_id}", response_model=ClientLessonCompetencyRead)
async def update_competency(
    competency_id: str,
    data: ClientLessonCompetencyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(competency_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid competency ID")
    result = await db.execute(select(ClientLessonCompetency).where(ClientLessonCompetency.id == cid))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Competency not found")
    if data.level is not None:
        comp.level = CompetencyProgress(data.level)
    if data.notes is not None:
        comp.notes = data.notes
    if data.order is not None:
        comp.order = data.order
    await db.flush()
    await db.refresh(comp)
    return ClientLessonCompetencyRead.model_validate(comp)


@router.delete("/api/v1/lessons/competencies/{competency_id}", status_code=204)
async def delete_competency(
    competency_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(competency_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid competency ID")
    result = await db.execute(select(ClientLessonCompetency).where(ClientLessonCompetency.id == cid))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Competency not found")
    await db.delete(comp)
    await db.flush()


# ═══════════════════════════════════════════
# Timer
# ═══════════════════════════════════════════


@router.get("/api/v1/lessons/{lesson_id}/timer", response_model=ClientLessonTimerRead)
async def get_timer(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    result = await db.execute(
        select(ClientLessonTimer).where(ClientLessonTimer.client_lesson_id == lid)
    )
    timer = result.scalar_one_or_none()
    if not timer:
        raise HTTPException(status_code=404, detail="Timer not found")
    return ClientLessonTimerRead.model_validate(timer)


@router.post("/api/v1/lessons/{lesson_id}/timer/start", response_model=ClientLessonTimerRead)
async def start_timer(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    result = await db.execute(
        select(ClientLessonTimer).where(ClientLessonTimer.client_lesson_id == lid)
    )
    timer = result.scalar_one_or_none()
    if not timer:
        timer = ClientLessonTimer(client_lesson_id=lid)
        db.add(timer)
        await db.flush()

    timer.started_at = datetime.utcnow()
    timer.started_by = current_user.phone
    timer.paused_at = None
    timer.paused_by = None
    timer.status = "running"
    await db.flush()
    await db.refresh(timer)
    return ClientLessonTimerRead.model_validate(timer)


@router.post("/api/v1/lessons/{lesson_id}/timer/pause", response_model=ClientLessonTimerRead)
async def pause_timer(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    result = await db.execute(
        select(ClientLessonTimer).where(ClientLessonTimer.client_lesson_id == lid)
    )
    timer = result.scalar_one_or_none()
    if not timer:
        raise HTTPException(status_code=404, detail="Timer not found")
    if timer.status != "running":
        raise HTTPException(status_code=400, detail="Timer is not running")
    timer.paused_at = datetime.utcnow()
    timer.paused_by = current_user.phone
    timer.status = "paused"
    await db.flush()
    await db.refresh(timer)
    return ClientLessonTimerRead.model_validate(timer)


@router.post("/api/v1/lessons/{lesson_id}/timer/resume", response_model=ClientLessonTimerRead)
async def resume_timer(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    result = await db.execute(
        select(ClientLessonTimer).where(ClientLessonTimer.client_lesson_id == lid)
    )
    timer = result.scalar_one_or_none()
    if not timer:
        raise HTTPException(status_code=404, detail="Timer not found")
    if timer.status != "paused":
        raise HTTPException(status_code=400, detail="Timer is not paused")
    timer.paused_at = None
    timer.paused_by = None
    timer.status = "running"
    await db.flush()
    await db.refresh(timer)
    return ClientLessonTimerRead.model_validate(timer)


@router.put("/api/v1/lessons/{lesson_id}/timer/sync", response_model=ClientLessonTimerRead)
async def sync_timer(
    lesson_id: str,
    data: ClientLessonTimerSync,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    result = await db.execute(
        select(ClientLessonTimer).where(ClientLessonTimer.client_lesson_id == lid)
    )
    timer = result.scalar_one_or_none()
    if not timer:
        raise HTTPException(status_code=404, detail="Timer not found")
    timer.total_seconds = data.total_seconds
    timer.elapsed_minutes = data.total_seconds // 60
    if data.distance_km is not None:
        timer.distance_km = data.distance_km
    await db.flush()
    await db.refresh(timer)
    return ClientLessonTimerRead.model_validate(timer)


# ═══════════════════════════════════════════
# Theory Sessions
# ═══════════════════════════════════════════


@router.get("/api/v1/lesson-plans/{plan_id}/theory", response_model=list[TheorySessionRead])
async def list_theory_sessions(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    result = await db.execute(
        select(TheorySession)
        .where(TheorySession.lesson_plan_id == pid)
        .order_by(TheorySession.session_date)
    )
    sessions = list(result.scalars().all())
    return [TheorySessionRead.model_validate(s) for s in sessions]


@router.post("/api/v1/lesson-plans/{plan_id}/theory", response_model=TheorySessionRead, status_code=201)
async def create_theory_session(
    plan_id: str,
    data: TheorySessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    session = TheorySession(
        lesson_plan_id=pid,
        week_number=data.week_number,
        session_date=data.session_date,
        duration_minutes=data.duration_minutes,
        topic=data.topic,
        video_ids=data.video_ids,
        slides_url=data.slides_url,
        quiz_data=data.quiz_data,
        instructor_id=data.instructor_id,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return TheorySessionRead.model_validate(session)


@router.post("/api/v1/lesson-plans/{plan_id}/theory/generate", response_model=list[TheorySessionRead], status_code=201)
async def generate_theory_sessions(
    plan_id: str,
    data: TheorySessionGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")

    topics = [
        "Road Signs & Markings",
        "Traffic Rules & Regulations",
        "Defensive Driving Techniques",
        "Vehicle Controls & Safety",
    ]

    created = []
    for w in range(1, data.total_weeks + 1):
        session_date = data.start_date
        # Find the next Saturday
        days_ahead = 5 - session_date.weekday()  # Saturday = 5
        if days_ahead <= 0:
            days_ahead += 7
        session_date = session_date.replace(hour=10, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        session_date = session_date + timedelta(days=days_ahead + (w - 1) * 7)

        topic = topics[(w - 1) % len(topics)]
        session = TheorySession(
            lesson_plan_id=pid,
            week_number=w,
            session_date=session_date,
            duration_minutes=data.session_duration_minutes,
            topic=topic,
        )
        db.add(session)
        created.append(session)
    await db.flush()

    result = await db.execute(
        select(TheorySession)
        .where(TheorySession.lesson_plan_id == pid)
        .order_by(TheorySession.session_date)
    )
    all_sessions = list(result.scalars().all())
    return [TheorySessionRead.model_validate(s) for s in all_sessions]


@router.patch("/api/v1/lesson-plans/theory/{session_id}", response_model=TheorySessionRead)
async def update_theory_session(
    session_id: str,
    data: TheorySessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    result = await db.execute(select(TheorySession).where(TheorySession.id == sid))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Theory session not found")
    if data.session_date is not None:
        session.session_date = data.session_date
    if data.duration_minutes is not None:
        session.duration_minutes = data.duration_minutes
    if data.topic is not None:
        session.topic = data.topic
    if data.video_ids is not None:
        session.video_ids = data.video_ids
    if data.slides_url is not None:
        session.slides_url = data.slides_url
    if data.quiz_data is not None:
        session.quiz_data = data.quiz_data
    if data.attendance_list is not None:
        session.attendance_list = data.attendance_list
    if data.instructor_id is not None:
        session.instructor_id = data.instructor_id
    if data.status is not None:
        session.status = TheorySessionStatus(data.status)
    if data.notes is not None:
        session.notes = data.notes
    await db.flush()
    await db.refresh(session)
    return TheorySessionRead.model_validate(session)


# ═══════════════════════════════════════════
# Competency Dashboard
# ═══════════════════════════════════════════


@router.get("/api/v1/students/{consultation_id}/competency-dashboard")
async def get_competency_dashboard(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid consultation ID")

    from app.models.cart import CartItem
    cart_result = await db.execute(
        select(CartItem).where(CartItem.consultation_id == cid)
    )
    cart_items = list(cart_result.scalars().all())
    cart_ids = [ci.id for ci in cart_items]

    plans_result = await db.execute(
        select(ClientLessonPlan).where(ClientLessonPlan.cart_item_id.in_(cart_ids))
    )
    plans = list(plans_result.scalars().all())

    plan_ids = [p.id for p in plans]
    if not plan_ids:
        return {"competencies": [], "overall_summary": {}}

    lessons_result = await db.execute(
        select(ClientLesson).where(ClientLesson.lesson_plan_id.in_(plan_ids))
    )
    lessons = list(lessons_result.scalars().all())

    lesson_ids = [l.id for l in lessons]
    if not lesson_ids:
        return {"competencies": [], "overall_summary": {}}

    comps_result = await db.execute(
        select(ClientLessonCompetency).where(ClientLessonCompetency.client_lesson_id.in_(lesson_ids))
    )
    competencies = list(comps_result.scalars().all())

    levels_order = ["not_started", "learning", "practising", "competent", "mastered"]
    comp_summary: dict[str, dict] = {}
    for c in competencies:
        name = c.competency_name
        if name not in comp_summary:
            comp_summary[name] = {"name": name, "counts": {l: 0 for l in levels_order}, "total": 0}
        comp_summary[name]["counts"][c.level.value] += 1
        comp_summary[name]["total"] += 1

    result_list = []
    for name, data in comp_summary.items():
        best_level = "not_started"
        for l in reversed(levels_order):
            if data["counts"][l] > 0:
                best_level = l
                break
        data["highest_level"] = best_level
        result_list.append(data)

    total_items = sum(d["total"] for d in result_list)
    mastered_items = sum(d["counts"]["mastered"] for d in result_list)
    competent_items = sum(d["counts"]["competent"] for d in result_list)

    return {
        "competencies": result_list,
        "overall_summary": {
            "total_competencies": len(result_list),
            "total_ratings": total_items,
            "mastered_count": mastered_items,
            "competent_count": competent_items,
            "progress_pct": round((mastered_items + competent_items) / max(total_items, 1) * 100, 1),
        },
    }
