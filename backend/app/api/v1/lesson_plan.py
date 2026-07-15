import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import (
    ClientLessonPlanCreate,
    ClientLessonPlanRead,
    ClientLessonPlanUpdate,
    ClientLessonRead,
    ClientLessonUpdate,
    LessonBulkReorder,
    LessonHistoryRead,
    LessonPlanImportResponse,
    LessonPlanImportValidate,
    LessonPlanTemplateCreate,
    LessonPlanTemplateRead,
    LessonPlanTemplateUpdate,
    LessonTemplateItemCreate,
    LessonTemplateItemRead,
    LessonTemplateItemUpdate,
)
from app.services import lesson_plan as lesson_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["lesson-plans"])


# ── Templates ──


@router.get("/api/v1/lesson-plan-templates", response_model=list[LessonPlanTemplateRead])
async def list_templates(
    transmission_type: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    templates = await lesson_service.list_templates(db, transmission_type, status, company_id=current_user.company_id)
    return [LessonPlanTemplateRead.model_validate(t) for t in templates]


@router.post("/api/v1/lesson-plan-templates", response_model=LessonPlanTemplateRead, status_code=201)
async def create_template(
    data: LessonPlanTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items_data = [i.model_dump() for i in data.items]
    template = await lesson_service.create_template(
        db,
        name=data.name,
        transmission_type=data.transmission_type,
        description=data.description,
        total_days=data.total_days,
        total_weeks=data.total_weeks,
        template_type=data.template_type,
        items_data=items_data,
        created_by_phone=current_user.phone,
        company_id=current_user.company_id,
    )
    return LessonPlanTemplateRead.model_validate(template)


@router.get("/api/v1/lesson-plan-templates/{template_id}", response_model=LessonPlanTemplateRead)
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    template = await lesson_service.get_template_by_id(db, tid, company_id=current_user.company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return LessonPlanTemplateRead.model_validate(template)


@router.patch("/api/v1/lesson-plan-templates/{template_id}", response_model=LessonPlanTemplateRead)
async def update_template(
    template_id: str,
    data: LessonPlanTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    template = await lesson_service.get_template_by_id(db, tid, company_id=current_user.company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    updated = await lesson_service.update_template(
        db, template,
        name=data.name,
        description=data.description,
        total_days=data.total_days,
        total_weeks=data.total_weeks,
        template_type=data.template_type,
        status=data.status,
        is_locked=data.is_locked,
        items_data=[i.model_dump() for i in data.items] if data.items is not None else None,
    )
    return LessonPlanTemplateRead.model_validate(updated)


@router.delete("/api/v1/lesson-plan-templates/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    template = await lesson_service.get_template_by_id(db, tid, company_id=current_user.company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await lesson_service.delete_template(db, template)


@router.post("/api/v1/lesson-plan-templates/{template_id}/duplicate", response_model=LessonPlanTemplateRead, status_code=201)
async def duplicate_template(
    template_id: str,
    name: str = Query(..., description="Name for the duplicated template"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    try:
        template = await lesson_service.duplicate_template(db, tid, name, created_by_phone=current_user.phone, company_id=current_user.company_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return LessonPlanTemplateRead.model_validate(template)


@router.post("/api/v1/lesson-plan-templates/{template_id}/archive", response_model=LessonPlanTemplateRead)
async def archive_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    template = await lesson_service.get_template_by_id(db, tid, company_id=current_user.company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    updated = await lesson_service.archive_template(db, template)
    return LessonPlanTemplateRead.model_validate(updated)


@router.get("/api/v1/lesson-plan-templates/{template_id}/export")
async def export_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    try:
        return await lesson_service.export_template_json(db, tid, company_id=current_user.company_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/api/v1/lesson-plan-templates/import", response_model=LessonPlanImportResponse, status_code=201)
async def import_template_from_json(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        template, import_log = await lesson_service.import_template_json(db, data, created_by_phone=current_user.phone, company_id=current_user.company_id)
        return LessonPlanImportResponse(
            template=LessonPlanTemplateRead.model_validate(template),
            import_log=None,  # TODO: add ImportLogRead
            validation=None,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/v1/lesson-plan-templates/validate", response_model=LessonPlanImportValidate)
async def validate_import_json(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await lesson_service.validate_import_json(data)
    return LessonPlanImportValidate(**result)


# ── Template Items ──


@router.post("/api/v1/lesson-plan-templates/{template_id}/items", response_model=LessonTemplateItemRead, status_code=201)
async def create_template_item(
    template_id: str,
    data: LessonTemplateItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    item = await lesson_service.create_template_item(
        db, tid,
        day_number=data.day_number,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
        week_number=data.week_number,
        title=data.title,
        lesson_objectives=data.lesson_objectives,
        practical_objectives=data.practical_objectives,
        estimated_minutes=data.estimated_minutes,
        estimated_distance_km=data.estimated_distance_km,
        order=data.order,
        lesson_library_id=data.lesson_library_id,
        preferred_location=data.preferred_location,
        enforce_prerequisites=data.enforce_prerequisites,
    )
    return LessonTemplateItemRead.model_validate(item)


@router.patch("/api/v1/lesson-plan-templates/items/{item_id}", response_model=LessonTemplateItemRead)
async def update_template_item(
    item_id: str,
    data: LessonTemplateItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    from sqlalchemy import select
    from app.models.lesson_plan import LessonTemplateItem, LessonPlanTemplate
    from app.models.company import Branch
    from app.models.cart import CartItem
    from app.models.consultation import Consultation
    query = select(LessonTemplateItem).where(LessonTemplateItem.id == iid)
    if current_user.role.value != 'super_user' and current_user.company_id is not None:
        query = query.join(LessonPlanTemplate, LessonTemplateItem.template_id == LessonPlanTemplate.id).where(
            LessonPlanTemplate.company_id == current_user.company_id
        )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    updated = await lesson_service.update_template_item(
        db, item,
        day_number=data.day_number,
        week_number=data.week_number,
        title=data.title,
        lesson_objectives=data.lesson_objectives,
        practical_objectives=data.practical_objectives,
        estimated_minutes=data.estimated_minutes,
        estimated_distance_km=data.estimated_distance_km,
        order=data.order,
        lesson_library_id=data.lesson_library_id,
        preferred_location=data.preferred_location,
        enforce_prerequisites=data.enforce_prerequisites,
    )
    return LessonTemplateItemRead.model_validate(updated)


@router.delete("/api/v1/lesson-plan-templates/items/{item_id}", status_code=204)
async def delete_template_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    from sqlalchemy import select
    from app.models.lesson_plan import LessonTemplateItem, LessonPlanTemplate
    query = select(LessonTemplateItem).where(LessonTemplateItem.id == iid)
    if current_user.role.value != 'super_user' and current_user.company_id is not None:
        query = query.join(LessonPlanTemplate, LessonTemplateItem.template_id == LessonPlanTemplate.id).where(
            LessonPlanTemplate.company_id == current_user.company_id
        )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await lesson_service.delete_template_item(db, item)


# ── Client Lesson Plans ──


@router.get("/api/v1/cart-items/{cart_item_id}/lesson-plans", response_model=list[ClientLessonPlanRead])
async def list_client_plans(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    plans = await lesson_service.list_client_plans(db, cart_item_id=cid, company_id=current_user.company_id, current_user_role=current_user.role)
    return [ClientLessonPlanRead.model_validate(p) for p in plans]


@router.post("/api/v1/cart-items/{cart_item_id}/lesson-plans", response_model=ClientLessonPlanRead, status_code=201)
async def create_client_plan(
    cart_item_id: str,
    data: ClientLessonPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")

    practical_id = uuid.UUID(data.template_id) if data.template_id else None
    theory_id = uuid.UUID(data.theory_template_id) if data.theory_template_id else None

    # Merge case: both practical and theory templates provided
    if practical_id and theory_id:
        try:
            plan = await lesson_service.create_merged_client_plan(
                db, cid, practical_id, theory_id,
                transmission_type=data.transmission_type,
                start_date=data.start_date,
                notes=data.notes,
                company_id=current_user.company_id, current_user_role=current_user.role,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    elif practical_id:
        try:
            plan = await lesson_service.create_client_plan_from_template(
                db, cid, practical_id,
                transmission_type=data.transmission_type,
                start_date=data.start_date,
                notes=data.notes,
                manual_days=data.manual_days,
                company_id=current_user.company_id, current_user_role=current_user.role,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    elif theory_id:
        try:
            plan = await lesson_service.create_client_plan_from_template(
                db, cid, theory_id,
                transmission_type=data.transmission_type,
                start_date=data.start_date,
                notes=data.notes,
                manual_days=data.manual_days,
                company_id=current_user.company_id, current_user_role=current_user.role,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    else:
        lessons_data = [l.model_dump() for l in data.lessons]
        plan = await lesson_service.create_client_plan(
            db, cid,
            transmission_type=data.transmission_type,
            template_id=None,
            start_date=data.start_date,
            is_extension=data.is_extension,
            extension_of_plan_id=uuid.UUID(data.extension_of_plan_id) if data.extension_of_plan_id else None,
            extension_days_added=data.extension_days_added,
            notes=data.notes,
            lessons_data=lessons_data,
            manual_days=data.manual_days,
            company_id=current_user.company_id, current_user_role=current_user.role,
        )
    return ClientLessonPlanRead.model_validate(plan)


@router.post("/api/v1/cart-items/{cart_item_id}/lesson-plans/generate", response_model=ClientLessonPlanRead, status_code=201)
async def generate_student_plan(
    cart_item_id: str,
    template_id: str,
    transmission_type: str,
    start_date: str,
    purchased_days: int,
    notes: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(cart_item_id)
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start_date format (ISO8601)")
    try:
        plan = await lesson_service.generate_student_plan(
            db, cid, tid, transmission_type, dt, purchased_days, notes,
            company_id=current_user.company_id, current_user_role=current_user.role,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ClientLessonPlanRead.model_validate(plan)


@router.get("/api/v1/lesson-plans/{plan_id}", response_model=ClientLessonPlanRead)
async def get_client_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    plan = await lesson_service.get_client_plan_by_id(db, pid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    return ClientLessonPlanRead.model_validate(plan)


@router.patch("/api/v1/lesson-plans/{plan_id}", response_model=ClientLessonPlanRead)
async def update_client_plan(
    plan_id: str,
    data: ClientLessonPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    plan = await lesson_service.get_client_plan_by_id(db, pid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    updated = await lesson_service.update_client_plan(
        db, plan,
        start_date=data.start_date,
        status=data.status,
        purchased_days=data.purchased_days,
        notes=data.notes,
    )
    return ClientLessonPlanRead.model_validate(updated)


@router.delete("/api/v1/lesson-plans/{plan_id}", status_code=204)
async def delete_client_plan(
    plan_id: str,
    delete_mode: str = Query("all", description="all | unstarted | uncompleted"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    plan = await lesson_service.get_client_plan_by_id(db, pid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    if delete_mode not in ("all", "unstarted", "uncompleted"):
        raise HTTPException(status_code=400, detail="Invalid delete_mode")
    try:
        result = await lesson_service.delete_client_plan(db, plan, delete_mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/v1/lesson-plans/{plan_id}/upgrade", response_model=ClientLessonPlanRead)
async def upgrade_plan(
    plan_id: str,
    purchased_days: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    plan = await lesson_service.get_client_plan_by_id(db, pid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    if purchased_days <= (plan.purchased_days or 0):
        raise HTTPException(status_code=400, detail="New purchased days must be greater than current")
    updated = await lesson_service.upgrade_plan(db, plan, purchased_days)
    return ClientLessonPlanRead.model_validate(updated)


# ── Client Lessons ──


@router.patch("/api/v1/lesson-plans/lessons/{lesson_id}", response_model=ClientLessonRead)
async def update_client_lesson(
    lesson_id: str,
    data: ClientLessonUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await lesson_service.get_client_lesson_by_id(db, lid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    updated = await lesson_service.update_client_lesson(
        db, lesson,
        day_number=data.day_number,
        week_number=data.week_number,
        title=data.title,
        lesson_objectives=data.lesson_objectives,
        practical_objectives=data.practical_objectives,
        order=data.order,
        is_active=data.is_active,
        is_locked=data.is_locked,
        status=data.status,
        difficulty=data.difficulty,
        vehicle_inspection_minutes=data.vehicle_inspection_minutes,
        cockpit_drill_minutes=data.cockpit_drill_minutes,
        video_illustration_minutes=data.video_illustration_minutes,
        practical_driving_minutes=data.practical_driving_minutes,
        assessment_minutes=data.assessment_minutes,
        driving_minutes=data.driving_minutes,
        theory_minutes=data.theory_minutes,
        mileage_km=data.mileage_km,
        is_theory=data.is_theory,
        combined_with_next=data.combined_with_next,
        skills_achieved=data.skills_achieved,
        outcome=data.outcome,
        instructor_id=data.instructor_id or current_user.phone,
        vehicle_id=data.vehicle_id,
        notes=data.notes,
        preferred_location=data.preferred_location,
        enforce_prerequisites=data.enforce_prerequisites,
    )
    return ClientLessonRead.model_validate(updated)


@router.post("/api/v1/lesson-plans/lessons/{lesson_id}/start", response_model=ClientLessonRead)
async def start_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await lesson_service.get_client_lesson_by_id(db, lid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson.is_locked:
        raise HTTPException(status_code=403, detail="Lesson is locked. Upgrade package to unlock.")
    if lesson.status.value in ("started", "completed", "paused"):
        raise HTTPException(status_code=400, detail=f"Lesson is already {lesson.status.value}")
    updated = await lesson_service.update_client_lesson(
        db, lesson, status="started", instructor_id=current_user.phone
    )

    # Send lesson scheduled SMS
    if current_user.company_id:
        try:
            from app.services.notification.service import on_lesson_scheduled
            from app.models.lesson_plan import ClientLessonPlan
            from app.models.cart import CartItem
            from app.models.consultation import Consultation
            from datetime import timedelta

            plan_result = await db.execute(
                select(ClientLessonPlan).where(ClientLessonPlan.id == lesson.lesson_plan_id)
            )
            plan = plan_result.scalar_one_or_none()
            if plan and plan.start_date and plan.cart_item_id:
                ci_result = await db.execute(
                    select(CartItem).where(CartItem.id == plan.cart_item_id)
                )
                cart_item = ci_result.scalar_one_or_none()
                if cart_item:
                    consult_result = await db.execute(
                        select(Consultation).where(Consultation.id == cart_item.consultation_id)
                    )
                    consultation = consult_result.scalar_one_or_none()
                    if consultation and consultation.phone:
                        client_name = " ".join(
                            filter(None, [consultation.first_name, consultation.middle_name, consultation.last_name])
                        ) or "Client"
                        lesson_date = plan.start_date + timedelta(days=(lesson.day_number or 1) - 1)
                        date_str = lesson_date.strftime("%Y-%m-%d")
                        time_str = "10:00"
                        instructor_name = current_user.name or current_user.phone
                        await on_lesson_scheduled(
                            db, current_user.company_id, consultation.phone, client_name,
                            date_str, time_str, instructor_name,
                        )
        except Exception as e:
            logger.warning("[SMS] Failed to send lesson_scheduled notification: %s", e)

    return ClientLessonRead.model_validate(updated)


@router.post("/api/v1/lesson-plans/lessons/{lesson_id}/complete", response_model=ClientLessonRead)
async def complete_lesson(
    lesson_id: str,
    outcome: str | None = None,
    notes: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await lesson_service.get_client_lesson_by_id(db, lid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson.status.value != "started" and lesson.status.value != "paused":
        raise HTTPException(status_code=400, detail="Lesson must be started before completing")
    updated = await lesson_service.update_client_lesson(
        db, lesson, status="completed", outcome=outcome, notes=notes
    )

    # Send training completed SMS
    if current_user.company_id:
        try:
            from app.services.notification.service import on_training_completed
            from app.models.lesson_plan import ClientLessonPlan
            from app.models.cart import CartItem
            from app.models.consultation import Consultation

            plan_result = await db.execute(
                select(ClientLessonPlan).where(ClientLessonPlan.id == lesson.lesson_plan_id)
            )
            plan = plan_result.scalar_one_or_none()
            if plan and plan.cart_item_id:
                ci_result = await db.execute(
                    select(CartItem).where(CartItem.id == plan.cart_item_id)
                )
                cart_item = ci_result.scalar_one_or_none()
                if cart_item:
                    consult_result = await db.execute(
                        select(Consultation).where(Consultation.id == cart_item.consultation_id)
                    )
                    consultation = consult_result.scalar_one_or_none()
                    if consultation and consultation.phone:
                        client_name = " ".join(
                            filter(None, [consultation.first_name, consultation.middle_name, consultation.last_name])
                        ) or "Client"
                        training_type = "theory" if lesson.is_theory else "driving"
                        lesson_num = str(lesson.day_number or "")
                        await on_training_completed(
                            db, current_user.company_id, consultation.phone, client_name,
                            training_type, lesson_num,
                        )
        except Exception as e:
            logger.warning("[SMS] Failed to send training_completed notification: %s", e)

    return ClientLessonRead.model_validate(updated)


@router.post("/api/v1/lesson-plans/lessons/{lesson_id}/skip", response_model=ClientLessonRead)
async def skip_lesson(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await lesson_service.get_client_lesson_by_id(db, lid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    updated = await lesson_service.update_client_lesson(
        db, lesson, status="skipped"
    )
    return ClientLessonRead.model_validate(updated)


@router.post("/api/v1/lesson-plans/lessons/{lesson_id}/move", response_model=list[ClientLessonRead])
async def move_lesson(
    lesson_id: str,
    new_day_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await lesson_service.get_client_lesson_by_id(db, lid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lessons = await lesson_service.move_lesson(db, lesson, new_day_number)
    return [ClientLessonRead.model_validate(l) for l in lessons]


@router.post("/api/v1/lesson-plans/{plan_id}/reorder", response_model=list[ClientLessonRead])
async def reorder_lessons(
    plan_id: str,
    data: LessonBulkReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan ID")
    lessons_data = [l.model_dump() for l in data.lessons]
    lessons = await lesson_service.bulk_reorder_lessons(db, pid, lessons_data, company_id=current_user.company_id, current_user_role=current_user.role)
    return [ClientLessonRead.model_validate(l) for l in lessons]


@router.get("/api/v1/lesson-plans/lessons/{lesson_id}/history", response_model=list[LessonHistoryRead])
async def get_lesson_history(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lesson ID")
    lesson = await lesson_service.get_client_lesson_by_id(db, lid, company_id=current_user.company_id, current_user_role=current_user.role)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    histories = await lesson_service.get_lesson_history(db, lid)
    return [LessonHistoryRead.model_validate(h) for h in histories]
