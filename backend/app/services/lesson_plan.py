import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.company import Branch
from app.models.consultation import Consultation
from app.models.lesson_plan import (
    ClientLesson,
    ClientLessonPlan,
    EntityStatus,
    ImportLog,
    ImportStatus,
    LessonDifficulty,
    LessonHistory,
    LessonLibrary,
    LessonPlanTemplate,
    LessonPlanStatus,
    LessonState,
    LessonTemplateItem,
    TransmissionType,
)
from app.models.user import UserRole


# ── Template CRUD ──


async def create_template(
    db: AsyncSession,
    name: str,
    transmission_type: str,
    description: str | None = None,
    total_days: int = 20,
    total_weeks: int = 4,
    template_type: str = "practical",
    items_data: list[dict] | None = None,
    created_by_phone: str | None = None,
    company_id: uuid.UUID | None = None,
) -> LessonPlanTemplate:
    template = LessonPlanTemplate(
        name=name,
        transmission_type=TransmissionType(transmission_type),
        description=description,
        total_days=total_days,
        total_weeks=total_weeks,
        template_type=template_type,
        created_by_phone=created_by_phone,
        company_id=company_id,
    )
    db.add(template)
    await db.flush()

    if items_data:
        for item in items_data:
            lo = item.get("lesson_objectives", [])
            po = item.get("practical_objectives", [])
            lib_id = item.get("lesson_library_id")
            if lib_id is None:
                # Auto-create a LessonLibrary entry so every template item links back
                lib = LessonLibrary(
                    title=item["title"],
                    lesson_objectives=lo if isinstance(lo, list) else [lo] if lo else [],
                    practical_objectives=po if isinstance(po, list) else [po] if po else [],
                    competencies=item.get("competencies", []),
                    estimated_minutes=item.get("estimated_minutes", 30),
                    estimated_distance_km=item.get("estimated_distance_km", 3.0),
                    difficulty=LessonDifficulty.BEGINNER,
                    is_theory=item.get("is_theory", False),
                )
                db.add(lib)
                await db.flush()
                lib_id = lib.id
            elif isinstance(lib_id, str):
                lib_id = uuid.UUID(lib_id)
            template_item = LessonTemplateItem(
                template_id=template.id,
                day_number=item["day_number"],
                week_number=item["week_number"],
                title=item["title"],
                lesson_objectives=lo if isinstance(lo, list) else [lo] if lo else [],
                practical_objectives=po if isinstance(po, list) else [po] if po else [],
                estimated_minutes=item.get("estimated_minutes", 30),
                estimated_distance_km=item.get("estimated_distance_km", 3.0),
                order=item.get("order", 0),
                lesson_library_id=lib_id,
                preferred_location=item.get("preferred_location"),
                enforce_prerequisites=item.get("enforce_prerequisites", True),
                is_theory=item.get("is_theory", False),
            )
            db.add(template_item)
        await db.flush()

    result = await db.execute(
        select(LessonPlanTemplate)
        .where(LessonPlanTemplate.id == template.id)
        .options(selectinload(LessonPlanTemplate.lesson_items))
    )
    return result.scalar_one()


async def get_template_by_id(
    db: AsyncSession, template_id: uuid.UUID, company_id: uuid.UUID | None = None
) -> LessonPlanTemplate | None:
    query = (
        select(LessonPlanTemplate)
        .where(LessonPlanTemplate.id == template_id)
        .options(selectinload(LessonPlanTemplate.lesson_items))
    )
    if company_id:
        query = query.where(LessonPlanTemplate.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_templates(
    db: AsyncSession, transmission_type: str | None = None, status: str | None = None,
    company_id: uuid.UUID | None = None,
) -> list[LessonPlanTemplate]:
    query = select(LessonPlanTemplate).options(selectinload(LessonPlanTemplate.lesson_items)).order_by(LessonPlanTemplate.created_at.desc())
    if company_id:
        query = query.where(LessonPlanTemplate.company_id == company_id)
    if transmission_type:
        query = query.where(LessonPlanTemplate.transmission_type == TransmissionType(transmission_type))
    if status:
        query = query.where(LessonPlanTemplate.status == EntityStatus(status))
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_template(
    db: AsyncSession,
    template: LessonPlanTemplate,
    name: str | None = None,
    description: str | None = None,
    total_days: int | None = None,
    total_weeks: int | None = None,
    template_type: str | None = None,
    status: str | None = None,
    is_locked: bool | None = None,
    items_data: list[dict] | None = None,
) -> LessonPlanTemplate:
    if name is not None:
        template.name = name
    if description is not None:
        template.description = description
    if total_days is not None:
        template.total_days = total_days
    if total_weeks is not None:
        template.total_weeks = total_weeks
    if template_type is not None:
        template.template_type = template_type
    if status is not None:
        template.status = EntityStatus(status)
    if is_locked is not None:
        template.is_locked = is_locked

    if items_data is not None:
        # Load existing items
        result = await db.execute(
            select(LessonTemplateItem).where(LessonTemplateItem.template_id == template.id)
        )
        existing_items = {item.id: item for item in result.scalars().all()}
        incoming_ids = set()
        # Process each incoming item
        for item in items_data:
            item_id = item.get("id")
            if item_id:
                if isinstance(item_id, str):
                    item_id = uuid.UUID(item_id)
                if item_id in existing_items:
                    # Update existing item
                    existing = existing_items[item_id]
                    incoming_ids.add(item_id)
                    if "day_number" in item:
                        existing.day_number = item["day_number"]
                    if "week_number" in item:
                        existing.week_number = item["week_number"]
                    if "title" in item:
                        existing.title = item["title"]
                    lo = item.get("lesson_objectives", [])
                    if lo is not None:
                        existing.lesson_objectives = lo if isinstance(lo, list) else [lo] if lo else []
                    po = item.get("practical_objectives", [])
                    if po is not None:
                        existing.practical_objectives = po if isinstance(po, list) else [po] if po else []
                    if "estimated_minutes" in item:
                        existing.estimated_minutes = item["estimated_minutes"]
                    if "estimated_distance_km" in item:
                        existing.estimated_distance_km = item["estimated_distance_km"]
                    if "order" in item:
                        existing.order = item["order"]
                    if "preferred_location" in item:
                        existing.preferred_location = item.get("preferred_location")
                    if "enforce_prerequisites" in item:
                        existing.enforce_prerequisites = item["enforce_prerequisites"]
                    if "is_theory" in item:
                        existing.is_theory = item["is_theory"]
            else:
                # Create new item
                lo = item.get("lesson_objectives", [])
                po = item.get("practical_objectives", [])
                lib_id = item.get("lesson_library_id")
                if lib_id is None:
                    lib = LessonLibrary(
                        title=item["title"],
                        lesson_objectives=lo if isinstance(lo, list) else [lo] if lo else [],
                        practical_objectives=po if isinstance(po, list) else [po] if po else [],
                        competencies=item.get("competencies", []),
                        estimated_minutes=item.get("estimated_minutes", 30),
                        estimated_distance_km=item.get("estimated_distance_km", 3.0),
                        difficulty=LessonDifficulty.BEGINNER,
                        is_theory=item.get("is_theory", False),
                    )
                    db.add(lib)
                    await db.flush()
                    lib_id = lib.id
                elif isinstance(lib_id, str):
                    lib_id = uuid.UUID(lib_id)
                new_item = LessonTemplateItem(
                    template_id=template.id,
                    day_number=item["day_number"],
                    week_number=item["week_number"],
                    title=item["title"],
                    lesson_objectives=lo if isinstance(lo, list) else [lo] if lo else [],
                    practical_objectives=po if isinstance(po, list) else [po] if po else [],
                    estimated_minutes=item.get("estimated_minutes", 30),
                    estimated_distance_km=item.get("estimated_distance_km", 3.0),
                    order=item.get("order", 0),
                    lesson_library_id=lib_id,
                    preferred_location=item.get("preferred_location"),
                    enforce_prerequisites=item.get("enforce_prerequisites", True),
                    is_theory=item.get("is_theory", False),
                )
                db.add(new_item)
        # Delete items no longer present
        for item_id, existing in existing_items.items():
            if item_id not in incoming_ids:
                await db.delete(existing)
        await db.flush()

    result = await db.execute(
        select(LessonPlanTemplate)
        .where(LessonPlanTemplate.id == template.id)
        .options(selectinload(LessonPlanTemplate.lesson_items))
    )
    return result.scalar_one()


async def delete_template(db: AsyncSession, template: LessonPlanTemplate) -> None:
    await db.delete(template)
    await db.flush()


async def duplicate_template(
    db: AsyncSession,
    template_id: uuid.UUID,
    new_name: str,
    created_by_phone: str | None = None,
    company_id: uuid.UUID | None = None,
) -> LessonPlanTemplate:
    original = await get_template_by_id(db, template_id, company_id=company_id)
    if not original:
        raise ValueError("Template not found")

    template = LessonPlanTemplate(
        name=new_name,
        transmission_type=original.transmission_type,
        description=original.description,
        total_days=original.total_days,
        total_weeks=original.total_weeks,
        created_by_phone=created_by_phone,
        company_id=company_id or original.company_id,
    )
    db.add(template)
    await db.flush()

    for item in original.lesson_items:
        template_item = LessonTemplateItem(
            template_id=template.id,
            day_number=item.day_number,
            week_number=item.week_number,
            title=item.title,
            lesson_objectives=item.lesson_objectives,
            practical_objectives=item.practical_objectives,
            estimated_minutes=item.estimated_minutes,
            estimated_distance_km=item.estimated_distance_km,
            order=item.order,
            lesson_library_id=item.lesson_library_id,
        )
        db.add(template_item)
    await db.flush()

    result = await db.execute(
        select(LessonPlanTemplate)
        .where(LessonPlanTemplate.id == template.id)
        .options(selectinload(LessonPlanTemplate.lesson_items))
    )
    return result.scalar_one()


async def archive_template(
    db: AsyncSession, template: LessonPlanTemplate
) -> LessonPlanTemplate:
    template.status = EntityStatus.INACTIVE
    await db.flush()
    await db.refresh(template)
    return template


# ── Template Items ──


async def create_template_item(
    db: AsyncSession,
    template_id: uuid.UUID,
    day_number: int,
    week_number: int,
    title: str,
    lesson_objectives: list[str] | None = None,
    practical_objectives: list[str] | None = None,
    estimated_minutes: int = 30,
    estimated_distance_km: float = 3.0,
    order: int = 0,
    lesson_library_id: str | uuid.UUID | None = None,
    preferred_location: str | None = None,
    enforce_prerequisites: bool = True,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> LessonTemplateItem:
    if not await _verify_template_company(db, template_id, company_id, current_user_role):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Template not found")
    if lesson_library_id is None:
        lib = LessonLibrary(
            title=title,
            lesson_objectives=lesson_objectives or [],
            practical_objectives=practical_objectives or [],
            competencies=[],
            estimated_minutes=estimated_minutes,
            estimated_distance_km=estimated_distance_km,
            difficulty=LessonDifficulty.BEGINNER,
        )
        db.add(lib)
        await db.flush()
        lesson_library_id = lib.id
    elif isinstance(lesson_library_id, str):
        lesson_library_id = uuid.UUID(lesson_library_id)

    item = LessonTemplateItem(
        template_id=template_id,
        day_number=day_number,
        week_number=week_number,
        title=title,
        lesson_objectives=lesson_objectives or [],
        practical_objectives=practical_objectives or [],
        estimated_minutes=estimated_minutes,
        estimated_distance_km=estimated_distance_km,
        order=order,
        lesson_library_id=lesson_library_id,
        preferred_location=preferred_location,
        enforce_prerequisites=enforce_prerequisites,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_template_item(
    db: AsyncSession,
    item: LessonTemplateItem,
    day_number: int | None = None,
    week_number: int | None = None,
    title: str | None = None,
    lesson_objectives: list[str] | None = None,
    practical_objectives: list[str] | None = None,
    estimated_minutes: int | None = None,
    estimated_distance_km: float | None = None,
    order: int | None = None,
    lesson_library_id: str | uuid.UUID | None = None,
    preferred_location: str | None = None,
    enforce_prerequisites: bool | None = None,
) -> LessonTemplateItem:
    if day_number is not None:
        item.day_number = day_number
    if week_number is not None:
        item.week_number = week_number
    if title is not None:
        item.title = title
    if lesson_objectives is not None:
        item.lesson_objectives = lesson_objectives
    if practical_objectives is not None:
        item.practical_objectives = practical_objectives
    if estimated_minutes is not None:
        item.estimated_minutes = estimated_minutes
    if estimated_distance_km is not None:
        item.estimated_distance_km = estimated_distance_km
    if order is not None:
        item.order = order
    if lesson_library_id is not None:
        item.lesson_library_id = uuid.UUID(lesson_library_id) if isinstance(lesson_library_id, str) else lesson_library_id
    if preferred_location is not None:
        item.preferred_location = preferred_location
    if enforce_prerequisites is not None:
        item.enforce_prerequisites = enforce_prerequisites
    await db.flush()
    await db.refresh(item)
    return item


async def delete_template_item(db: AsyncSession, item: LessonTemplateItem) -> None:
    await db.delete(item)
    await db.flush()


# ── Client Lesson Plan ──


async def create_client_plan(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    transmission_type: str,
    template_id: uuid.UUID | None = None,
    start_date: datetime | None = None,
    is_extension: bool = False,
    extension_of_plan_id: uuid.UUID | None = None,
    extension_days_added: int | None = None,
    notes: str | None = None,
    lessons_data: list[dict] | None = None,
    purchased_days: int | None = None,
    manual_days: int | None = 5,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientLessonPlan:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Cart item not found")
    plan = ClientLessonPlan(
        cart_item_id=cart_item_id,
        template_id=template_id,
        transmission_type=TransmissionType(transmission_type),
        start_date=start_date,
        is_extension=is_extension,
        extension_of_plan_id=extension_of_plan_id,
        extension_days_added=extension_days_added,
        notes=notes,
        purchased_days=purchased_days,
        manual_days=manual_days,
    )
    db.add(plan)
    await db.flush()

    if lessons_data:
        for lesson in lessons_data:
            lo = lesson.get("lesson_objectives", [])
            po = lesson.get("practical_objectives", [])
            client_lesson = ClientLesson(
                lesson_plan_id=plan.id,
                day_number=lesson["day_number"],
                week_number=lesson["week_number"],
                title=lesson["title"],
                lesson_objectives=lo if isinstance(lo, list) else [lo] if lo else [],
                practical_objectives=po if isinstance(po, list) else [po] if po else [],
                order=lesson.get("order", 0),
                is_active=lesson.get("is_active", True),
                is_theory=lesson.get("is_theory", False),
                preferred_location=lesson.get("preferred_location"),
                enforce_prerequisites=lesson.get("enforce_prerequisites", True),
            )
            db.add(client_lesson)
        await db.flush()

    result = await db.execute(
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan.id)
        .options(selectinload(ClientLessonPlan.lessons))
    )
    return result.scalar_one()


async def create_client_plan_from_template(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    template_id: uuid.UUID,
    transmission_type: str,
    start_date: datetime | None = None,
    notes: str | None = None,
    purchased_days: int | None = None,
    manual_days: int | None = 5,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientLessonPlan:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        raise ValueError("Cart item not found")
    if not await _verify_template_company(db, template_id, company_id, current_user_role):
        raise ValueError("Template not found")
    template_result = await db.execute(
        select(LessonPlanTemplate)
        .where(LessonPlanTemplate.id == template_id)
        .options(selectinload(LessonPlanTemplate.lesson_items))
    )
    template = template_result.scalar_one_or_none()
    if not template:
        raise ValueError("Template not found")

    plan = ClientLessonPlan(
        cart_item_id=cart_item_id,
        template_id=template_id,
        transmission_type=TransmissionType(transmission_type),
        start_date=start_date,
        notes=notes,
        purchased_days=purchased_days or template.total_days,
        template_type=template.template_type,
        manual_days=manual_days,
    )
    db.add(plan)
    await db.flush()

    for item in template.lesson_items:
        is_locked = purchased_days is not None and item.day_number > purchased_days
        client_lesson = ClientLesson(
            lesson_plan_id=plan.id,
            template_item_id=item.id,
            day_number=item.day_number,
            week_number=item.week_number,
            title=item.title,
            lesson_objectives=item.lesson_objectives,
            practical_objectives=item.practical_objectives,
            order=item.order,
            is_active=True,
            is_locked=is_locked,
            is_theory=item.is_theory,
            preferred_location=item.preferred_location,
            enforce_prerequisites=item.enforce_prerequisites,
        )
        db.add(client_lesson)
    await db.flush()

    result = await db.execute(
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan.id)
        .options(selectinload(ClientLessonPlan.lessons))
    )
    return result.scalar_one()


async def create_merged_client_plan(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    practical_template_id: uuid.UUID,
    theory_template_id: uuid.UUID,
    transmission_type: str,
    start_date: datetime | None = None,
    notes: str | None = None,
    purchased_days: int | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientLessonPlan:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        raise ValueError("Cart item not found")
    if not await _verify_template_company(db, practical_template_id, company_id, current_user_role):
        raise ValueError("Practical template not found")
    if not await _verify_template_company(db, theory_template_id, company_id, current_user_role):
        raise ValueError("Theory template not found")
    """Merge a practical and theory template into one plan.
    
    Theory lessons are placed on days 6, 12, 18, 24 (Saturdays).
    Practical lessons keep their relative order but are shifted to accommodate
    theory day insertions.
    """
    # Fetch both templates
    tpl_result = await db.execute(
        select(LessonPlanTemplate)
        .where(LessonPlanTemplate.id.in_([practical_template_id, theory_template_id]))
        .options(selectinload(LessonPlanTemplate.lesson_items))
    )
    templates = tpl_result.scalars().all()
    practical_tpl = next(t for t in templates if t.id == practical_template_id)
    theory_tpl = next(t for t in templates if t.id == theory_template_id)

    # Theory insertion days (Saturdays in a 4-week practical plan)
    theory_days = [6, 12, 18, 24]
    theory_items = list(theory_tpl.lesson_items)

    # Build merged lesson items sorted by (day, order)
    merged = []
    for item in practical_tpl.lesson_items:
        # Count how many theory days are inserted before this item's current day
        shift = sum(1 for td in theory_days if td <= item.day_number)
        new_day = item.day_number + shift
        new_week = (new_day - 1) // 5 + 1
        merged.append({
            "template_item_id": item.id,
            "day_number": new_day,
            "week_number": new_week,
            "title": item.title,
            "lesson_objectives": item.lesson_objectives,
            "practical_objectives": item.practical_objectives,
            "order": item.order,
            "is_theory": False,
            "preferred_location": item.preferred_location,
            "enforce_prerequisites": item.enforce_prerequisites,
        })

    # Insert theory items at their designated days
    for idx, td in enumerate(theory_days):
        if idx < len(theory_items):
            item = theory_items[idx]
            merged.append({
                "template_item_id": item.id,
                "day_number": td,
                "week_number": (td - 1) // 5 + 1,
                "title": item.title,
                "lesson_objectives": item.lesson_objectives,
                "practical_objectives": item.practical_objectives,
                "order": item.order,
                "is_theory": True,
                "preferred_location": item.preferred_location,
                "enforce_prerequisites": item.enforce_prerequisites,
            })

    # Sort by day_number then order
    merged.sort(key=lambda x: (x["day_number"], x["order"]))

    total_days = max(x["day_number"] for x in merged) if merged else 0

    plan = ClientLessonPlan(
        cart_item_id=cart_item_id,
        template_id=practical_template_id,
        transmission_type=TransmissionType(transmission_type),
        start_date=start_date,
        notes=notes,
        purchased_days=purchased_days or total_days,
        template_type="practical",
        manual_days=5,
    )
    db.add(plan)
    await db.flush()

    for item in merged:
        is_locked = purchased_days is not None and item["day_number"] > purchased_days
        client_lesson = ClientLesson(
            lesson_plan_id=plan.id,
            template_item_id=item["template_item_id"],
            day_number=item["day_number"],
            week_number=item["week_number"],
            title=item["title"],
            lesson_objectives=item["lesson_objectives"],
            practical_objectives=item["practical_objectives"],
            order=item["order"],
            is_active=True,
            is_locked=is_locked,
            is_theory=item["is_theory"],
            preferred_location=item["preferred_location"],
            enforce_prerequisites=item["enforce_prerequisites"],
        )
        db.add(client_lesson)
    await db.flush()

    result = await db.execute(
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan.id)
        .options(selectinload(ClientLessonPlan.lessons))
    )
    return result.scalar_one()


async def _verify_cart_item_company(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    if user_role == UserRole.SUPER_USER or company_id is None:
        return True
    result = await db.execute(
        select(CartItem).join(Consultation, CartItem.consultation_id == Consultation.id)
        .join(Branch, Consultation.branch_id == Branch.id)
        .where(CartItem.id == cart_item_id, Branch.company_id == company_id)
    )
    return result.scalar_one_or_none() is not None


async def _verify_template_company(
    db: AsyncSession, template_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    if user_role == UserRole.SUPER_USER or company_id is None:
        return True
    result = await db.execute(
        select(LessonPlanTemplate).where(
            LessonPlanTemplate.id == template_id,
            LessonPlanTemplate.company_id == company_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def get_client_plan_by_id(
    db: AsyncSession, plan_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientLessonPlan | None:
    query = (
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan_id)
        .options(selectinload(ClientLessonPlan.lessons))
    )
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = (
            query.join(CartItem, ClientLessonPlan.cart_item_id == CartItem.id)
            .join(Consultation, CartItem.consultation_id == Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(Branch.company_id == company_id)
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_client_plans(
    db: AsyncSession, cart_item_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[ClientLessonPlan]:
    if cart_item_id and not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        return []
    query = select(ClientLessonPlan).options(selectinload(ClientLessonPlan.lessons))
    if cart_item_id:
        query = query.where(ClientLessonPlan.cart_item_id == cart_item_id)
    query = query.order_by(ClientLessonPlan.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_client_plan(
    db: AsyncSession,
    plan: ClientLessonPlan,
    start_date: datetime | None = None,
    status: str | None = None,
    purchased_days: int | None = None,
    notes: str | None = None,
) -> ClientLessonPlan:
    if start_date is not None:
        plan.start_date = start_date
    if status is not None:
        plan.status = LessonPlanStatus(status)
    if purchased_days is not None:
        plan.purchased_days = purchased_days
    if notes is not None:
        plan.notes = notes
    await db.flush()

    result = await db.execute(
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan.id)
        .options(selectinload(ClientLessonPlan.lessons))
    )
    return result.scalar_one()


async def delete_client_plan(
    db: AsyncSession, plan: ClientLessonPlan, delete_mode: str = "all"
) -> dict:
    """Delete a client lesson plan.
    
    delete_mode:
      'all'        - delete entire plan (fails if any started lessons exist)
      'unstarted'  - delete only lessons with 'pending' status
      'uncompleted'- delete lessons with 'pending' or 'completed' status (keep in_progress)
    """
    if delete_mode == "all":
        started = [l for l in plan.lessons if l.status not in (LessonState.PENDING,)]
        if started:
            raise ValueError(
                "Cannot delete plan with started/completed lessons. "
                "Use 'unstarted' to delete only pending lessons, "
                "or 'uncompleted' to delete pending and completed lessons."
            )
        await db.delete(plan)
        await db.flush()
        return {"deleted": "all"}

    if delete_mode == "unstarted":
        to_remove = [l for l in plan.lessons if l.status == LessonState.PENDING]
        for lesson in to_remove:
            await db.delete(lesson)
    elif delete_mode == "uncompleted":
        to_remove = [l for l in plan.lessons if l.status in (LessonState.PENDING, LessonState.COMPLETED)]
        for lesson in to_remove:
            await db.delete(lesson)

    await db.flush()
    # Check if all lessons are gone; if so delete the plan too
    remaining = await db.execute(
        select(ClientLesson).where(ClientLesson.lesson_plan_id == plan.id)
    )
    if not remaining.scalars().first():
        await db.delete(plan)
        await db.flush()
        return {"deleted": "all"}
    return {"deleted": delete_mode}


async def upgrade_plan(
    db: AsyncSession,
    plan: ClientLessonPlan,
    new_purchased_days: int,
) -> ClientLessonPlan:
    plan.purchased_days = new_purchased_days
    await db.flush()

    # Unlock lessons that are now within purchased range
    for lesson in plan.lessons:
        if lesson.day_number <= new_purchased_days and lesson.is_locked:
            lesson.is_locked = False
    await db.flush()

    result = await db.execute(
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan.id)
        .options(selectinload(ClientLessonPlan.lessons))
    )
    return result.scalar_one()


# ── Client Lessons ──


async def update_client_lesson(
    db: AsyncSession,
    lesson: ClientLesson,
    day_number: int | None = None,
    week_number: int | None = None,
    title: str | None = None,
    lesson_objectives: list[str] | None = None,
    practical_objectives: list[str] | None = None,
    order: int | None = None,
    is_active: bool | None = None,
    is_locked: bool | None = None,
    status: str | None = None,
    difficulty: str | None = None,
    vehicle_inspection_minutes: int | None = None,
    cockpit_drill_minutes: int | None = None,
    video_illustration_minutes: int | None = None,
    practical_driving_minutes: int | None = None,
    assessment_minutes: int | None = None,
    driving_minutes: int | None = None,
    theory_minutes: int | None = None,
    mileage_km: float | None = None,
    is_theory: bool | None = None,
    combined_with_next: bool | None = None,
    skills_achieved: list | None = None,
    outcome: str | None = None,
    instructor_id: str | None = None,
    vehicle_id: str | None = None,
    notes: str | None = None,
    preferred_location: str | None = None,
    enforce_prerequisites: bool | None = None,
) -> ClientLesson:
    if day_number is not None:
        lesson.day_number = day_number
    if week_number is not None:
        lesson.week_number = week_number
    if title is not None:
        lesson.title = title
    if lesson_objectives is not None:
        lesson.lesson_objectives = lesson_objectives
    if practical_objectives is not None:
        lesson.practical_objectives = practical_objectives
    if order is not None:
        lesson.order = order
    if is_active is not None:
        lesson.is_active = is_active
    if is_locked is not None:
        lesson.is_locked = is_locked
    if status is not None:
        from_state = lesson.status.value if lesson.status else None
        lesson.status = LessonState(status)
        if status == "completed" and not lesson.completed_at:
            lesson.completed_at = datetime.utcnow()
        # Record history
        history = LessonHistory(
            client_lesson_id=lesson.id,
            from_state=from_state,
            to_state=status,
            changed_by=instructor_id,
        )
        db.add(history)
        # Auto-create commission when lesson completed with instructor
        if status == "completed" and lesson.instructor_id and from_state != "completed":
            try:
                from app.models.commission import Commission, CommissionRate, CommissionStatus
                from app.models.cart import CartItem
                from app.models.consultation import Consultation
                from app.models.company import Branch
                plan_q = await db.execute(
                    select(ClientLessonPlan).where(ClientLessonPlan.id == lesson.lesson_plan_id)
                )
                plan = plan_q.scalar_one_or_none()
                if plan:
                    ci_q = await db.execute(
                        select(CartItem).where(CartItem.id == plan.cart_item_id)
                    )
                    ci = ci_q.scalar_one_or_none()
                    if ci:
                        c_q = await db.execute(
                            select(Consultation).where(Consultation.id == ci.consultation_id)
                        )
                        c = c_q.scalar_one_or_none()
                        if c and c.branch_id:
                            b_q = await db.execute(
                                select(Branch).where(Branch.id == c.branch_id)
                            )
                            b = b_q.scalar_one_or_none()
                            if b:
                                company_id = b.company_id
                                rate_q = await db.execute(
                                    select(CommissionRate)
                                    .where(
                                        CommissionRate.company_id == company_id,
                                        CommissionRate.is_active == True,
                                    )
                                    .order_by(CommissionRate.created_at.desc())
                                    .limit(1)
                                )
                                rate = rate_q.scalars().first()
                                amount = rate.amount if rate else Decimal("0.00")
                                commission = Commission(
                                    company_id=company_id,
                                    instructor_id=lesson.instructor_id,
                                    client_lesson_id=lesson.id,
                                    commission_rate_id=rate.id if rate else None,
                                    amount=amount,
                                    status=CommissionStatus.PENDING,
                                )
                                db.add(commission)
            except Exception:
                pass
        history = LessonHistory(
            client_lesson_id=lesson.id,
            from_state=from_state,
            to_state=status,
            changed_by=instructor_id,
        )
        db.add(history)
    if difficulty is not None:
        from app.models.lesson_plan import LessonDifficulty
        lesson.difficulty = LessonDifficulty(difficulty)
    if vehicle_inspection_minutes is not None:
        lesson.vehicle_inspection_minutes = vehicle_inspection_minutes
    if cockpit_drill_minutes is not None:
        lesson.cockpit_drill_minutes = cockpit_drill_minutes
    if video_illustration_minutes is not None:
        lesson.video_illustration_minutes = video_illustration_minutes
    if practical_driving_minutes is not None:
        lesson.practical_driving_minutes = practical_driving_minutes
    if assessment_minutes is not None:
        lesson.assessment_minutes = assessment_minutes
    if driving_minutes is not None:
        lesson.driving_minutes = driving_minutes
    if theory_minutes is not None:
        lesson.theory_minutes = theory_minutes
    if mileage_km is not None:
        lesson.mileage_km = mileage_km
    if is_theory is not None:
        lesson.is_theory = is_theory
    if combined_with_next is not None:
        lesson.combined_with_next = combined_with_next
    if skills_achieved is not None:
        lesson.skills_achieved = skills_achieved
    if outcome is not None:
        lesson.outcome = outcome
    if instructor_id is not None:
        lesson.instructor_id = instructor_id
    if vehicle_id is not None:
        lesson.vehicle_id = uuid.UUID(vehicle_id) if isinstance(vehicle_id, str) else vehicle_id
    if notes is not None:
        lesson.notes = notes
    if preferred_location is not None:
        lesson.preferred_location = preferred_location
    if enforce_prerequisites is not None:
        lesson.enforce_prerequisites = enforce_prerequisites
    await db.flush()
    await db.refresh(lesson)
    return lesson


async def move_lesson(
    db: AsyncSession,
    lesson: ClientLesson,
    new_day_number: int,
) -> list[ClientLesson]:
    """Move a lesson to a new day, shifting other lessons automatically."""
    plan_id = lesson.lesson_plan_id
    old_day = lesson.day_number

    if new_day_number == old_day:
        result = await db.execute(
            select(ClientLesson).where(ClientLesson.lesson_plan_id == plan_id).order_by(ClientLesson.day_number)
        )
        return list(result.scalars().all())

    if new_day_number > old_day:
        # Shift lessons between old+1 and new_day down by 1
        await db.execute(
            update(ClientLesson)
            .where(ClientLesson.lesson_plan_id == plan_id)
            .where(ClientLesson.day_number > old_day)
            .where(ClientLesson.day_number <= new_day_number)
            .values(day_number=ClientLesson.day_number - 1)
        )
    else:
        # Shift lessons between new_day and old-1 up by 1
        await db.execute(
            update(ClientLesson)
            .where(ClientLesson.lesson_plan_id == plan_id)
            .where(ClientLesson.day_number >= new_day_number)
            .where(ClientLesson.day_number < old_day)
            .values(day_number=ClientLesson.day_number + 1)
        )

    lesson.day_number = new_day_number
    await db.flush()

    result = await db.execute(
        select(ClientLesson).where(ClientLesson.lesson_plan_id == plan_id).order_by(ClientLesson.day_number)
    )
    return list(result.scalars().all())


async def bulk_reorder_lessons(
    db: AsyncSession,
    plan_id: uuid.UUID,
    lessons_data: list[dict],
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[ClientLesson]:
    plan = await get_client_plan_by_id(db, plan_id, company_id=company_id, current_user_role=current_user_role)
    if not plan:
        return []
    for ld in lessons_data:
        await db.execute(
            update(ClientLesson)
            .where(ClientLesson.id == ld["id"])
            .where(ClientLesson.lesson_plan_id == plan_id)
            .values(
                order=ld.get("order", 0),
                week_number=ld.get("week_number") if ld.get("week_number") is not None else ClientLesson.week_number,
                day_number=ld.get("day_number") if ld.get("day_number") is not None else ClientLesson.day_number,
            )
        )
    await db.flush()

    result = await db.execute(
        select(ClientLesson)
        .where(ClientLesson.lesson_plan_id == plan_id)
        .order_by(ClientLesson.order)
    )
    return list(result.scalars().all())


async def get_client_lesson_by_id(
    db: AsyncSession, lesson_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientLesson | None:
    query = select(ClientLesson).where(ClientLesson.id == lesson_id)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = (
            query.join(ClientLessonPlan, ClientLesson.lesson_plan_id == ClientLessonPlan.id)
            .join(CartItem, ClientLessonPlan.cart_item_id == CartItem.id)
            .join(Consultation, CartItem.consultation_id == Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(Branch.company_id == company_id)
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


# ── Lesson History ──


async def get_lesson_history(
    db: AsyncSession, client_lesson_id: uuid.UUID
) -> list[LessonHistory]:
    result = await db.execute(
        select(LessonHistory)
        .where(LessonHistory.client_lesson_id == client_lesson_id)
        .order_by(LessonHistory.created_at.desc())
    )
    return list(result.scalars().all())


# ── Import / Export ──


async def export_template_json(
    db: AsyncSession, template_id: uuid.UUID, company_id: uuid.UUID | None = None
) -> dict:
    template = await get_template_by_id(db, template_id, company_id=company_id)
    if not template:
        raise ValueError("Template not found")

    weeks_map: dict[int, list[dict]] = {}
    for item in template.lesson_items:
        w = item.week_number
        if w not in weeks_map:
            weeks_map[w] = []
        weeks_map[w].append({
            "day_number": item.day_number,
            "title": item.title,
            "lesson_objectives": item.lesson_objectives or [],
            "practical_objectives": item.practical_objectives or [],
            "preferred_location": item.preferred_location,
            "enforce_prerequisites": item.enforce_prerequisites,
        })

    weeks = []
    for w in sorted(weeks_map.keys()):
        weeks.append({
            "week_number": w,
            "days": sorted(weeks_map[w], key=lambda d: d["day_number"]),
        })

    return {
        "version": "1.0",
        "title": template.name,
        "transmission_type": template.transmission_type.value if hasattr(template.transmission_type, 'value') else template.transmission_type,
        "total_days": template.total_days,
        "total_weeks": template.total_weeks,
        "description": template.description or "",
        "weeks": weeks,
    }


async def import_template_json(
    db: AsyncSession,
    data: dict,
    created_by_phone: str | None = None,
    company_id: uuid.UUID | None = None,
) -> tuple[LessonPlanTemplate, ImportLog]:
    import_log = ImportLog(
        import_type="lesson_plan_template",
        raw_json=data,
        status=ImportStatus.PENDING,
        created_by_phone=created_by_phone,
    )
    db.add(import_log)
    await db.flush()

    try:
        title = data.get("title", "Imported Template")
        transmission = data.get("transmission_type", "manual")
        total_days = data.get("total_days", 20)
        total_weeks = data.get("total_weeks", 4)
        description = data.get("description", "")

        items_data = []
        for week in data.get("weeks", []):
            w = week.get("week_number", 1)
            for day in week.get("days", []):
                items_data.append({
                    "day_number": day.get("day_number", 1),
                    "week_number": w,
                    "title": day.get("title", f"Day {day.get('day_number', 1)}"),
                    "lesson_objectives": day.get("lesson_objectives", []),
                    "practical_objectives": day.get("practical_objectives", []),
                    "preferred_location": day.get("preferred_location"),
                    "enforce_prerequisites": day.get("enforce_prerequisites", True),
                    "order": len(items_data) + 1,
                })

        template = await create_template(
            db, title, transmission,
            description=description,
            total_days=total_days,
            total_weeks=total_weeks,
            items_data=items_data,
            created_by_phone=created_by_phone,
            company_id=company_id,
        )

        import_log.status = ImportStatus.COMPLETED
        import_log.file_name = data.get("_filename")
        await db.flush()
        return template, import_log

    except Exception as e:
        import_log.status = ImportStatus.FAILED
        import_log.error_message = str(e)
        await db.flush()
        raise


async def validate_import_json(data: dict) -> dict:
    """Validate import JSON without persisting."""
    errors = []
    warnings = []

    if not data.get("title"):
        errors.append({"field": "title", "message": "Title is required"})

    transmission = data.get("transmission_type")
    if transmission not in ("manual", "automatic", "both"):
        errors.append({"field": "transmission_type", "message": f"Invalid transmission type: {transmission}"})

    seen_days: set[int] = set()
    for week in data.get("weeks", []):
        for day in week.get("days", []):
            dn = day.get("day_number")
            if dn in seen_days:
                errors.append({"field": f"day_{dn}", "message": f"Duplicate day number {dn}"})
            seen_days.add(dn)

            if not day.get("title"):
                errors.append({"field": f"day_{dn}_title", "message": f"Day {dn} is missing a title"})

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


# ── Auto-generate student plan ──


async def generate_student_plan(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    template_id: uuid.UUID,
    transmission_type: str,
    start_date: datetime,
    purchased_days: int,
    notes: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ClientLessonPlan:
    plan = await create_client_plan_from_template(
        db, cart_item_id, template_id, transmission_type,
        start_date=start_date, notes=notes, purchased_days=purchased_days,
    )

    plan.auto_generated = True
    await db.flush()

    return plan
