import math
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.company import Branch
from app.models.consultation import Consultation
from app.models.product import Package, Product
from app.models.training import Skill, TrainingSession
from app.models.user import UserRole
from app.schemas.training import TrainingSummary


async def _verify_cart_item_company(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    """Verify a cart item's consultation belongs to the user's company."""
    if user_role == UserRole.SUPER_USER or company_id is None:
        return True
    result = await db.execute(
        select(CartItem).join(Consultation, CartItem.consultation_id == Consultation.id)
        .join(Branch, Consultation.branch_id == Branch.id)
        .where(CartItem.id == cart_item_id, Branch.company_id == company_id)
    )
    return result.scalar_one_or_none() is not None


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
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> TrainingSession:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Cart item not found")
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
    db: AsyncSession, session_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> TrainingSession | None:
    query = (
        select(TrainingSession)
        .where(TrainingSession.id == session_id)
        .options(selectinload(TrainingSession.skills))
    )
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = (
            query.join(CartItem, TrainingSession.cart_item_id == CartItem.id)
            .join(Consultation, CartItem.consultation_id == Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(Branch.company_id == company_id)
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_training_sessions(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[TrainingSession]:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        return []
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


async def end_training_session(
    db: AsyncSession,
    session: TrainingSession,
    instructor_notes: str | None = None,
) -> TrainingSession:
    session.timer_seconds = None
    session.timer_started_at = None
    if instructor_notes is not None:
        session.instructor_notes = instructor_notes
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
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[TrainingSession]:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        raise ValueError("Cart item not found")
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


async def get_daily_schedule(
    db: AsyncSession,
    schedule_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    period: str = "daily",
    branch_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[dict]:
    from app.models.consultation import Consultation
    from app.models.lesson_plan import ClientLessonPlan, ClientLesson
    from app.models.payment import Payment
    from app.models.user import User

    # Determine date range
    if start_date and end_date:
        day_start = datetime.combine(start_date, datetime.min.time())
        day_end = datetime.combine(end_date, datetime.max.time())
    elif period == "daily" and schedule_date:
        day_start = datetime.combine(schedule_date, datetime.min.time())
        day_end = datetime.combine(schedule_date, datetime.max.time())
    else:
        today = date.today()
        if period == "weekly":
            monday = today - timedelta(days=today.weekday())
            sunday = monday + timedelta(days=6)
            day_start = datetime.combine(monday, datetime.min.time())
            day_end = datetime.combine(sunday, datetime.max.time())
        elif period == "monthly":
            month_start = today.replace(day=1)
            next_month = month_start.replace(month=month_start.month + 1) if month_start.month < 12 else month_start.replace(year=month_start.year + 1, month=1)
            month_end = next_month - timedelta(days=1)
            day_start = datetime.combine(month_start, datetime.min.time())
            day_end = datetime.combine(month_end, datetime.max.time())
        else:
            day_start = datetime.combine(today, datetime.min.time())
            day_end = datetime.combine(today, datetime.max.time())

    query = (
        select(TrainingSession)
        .join(CartItem, TrainingSession.cart_item_id == CartItem.id)
        .join(Consultation, CartItem.consultation_id == Consultation.id)
        .options(
            selectinload(TrainingSession.skills),
            selectinload(TrainingSession.cart_item).selectinload(CartItem.consultation),
        )
        .where(
            TrainingSession.session_date >= day_start,
            TrainingSession.session_date <= day_end,
        )
        .order_by(TrainingSession.session_date.asc())
    )

    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    if branch_id:
        query = query.where(Consultation.branch_id == branch_id)

    result = await db.execute(query)
    sessions = list(result.unique().scalars().all())

    # Collect consultation IDs for batch balance query
    consultation_ids = set()
    for s in sessions:
        consultation_ids.add(s.cart_item.consultation_id)

    # Batch query payments for balances (grouped by product_id)
    payments_by_consultation: dict[uuid.UUID, list[dict]] = {}
    if consultation_ids:
        pay_result = await db.execute(
            select(Payment).where(Payment.consultation_id.in_(consultation_ids))
        )
        for p in pay_result.scalars().all():
            cid = p.consultation_id
            if cid not in payments_by_consultation:
                payments_by_consultation[cid] = []
            payments_by_consultation[cid].append({
                "total_amount": float(p.total_amount),
                "total_paid": float(p.total_paid),
                "balance": float(p.balance),
                "product_id": p.product_id,
            })

    # Compute lessons left per cart item
    cart_item_ids = set(s.cart_item_id for s in sessions)
    completed_sessions_by_cart: dict[uuid.UUID, dict] = {}
    if cart_item_ids:
        comp_result = await db.execute(
            select(
                TrainingSession.cart_item_id,
                func.coalesce(func.sum(TrainingSession.driving_minutes), 0),
                func.coalesce(func.sum(TrainingSession.theory_minutes), 0),
                func.count(TrainingSession.id),
            ).where(
                TrainingSession.cart_item_id.in_(cart_item_ids),
                TrainingSession.started_at.isnot(None),
            ).group_by(TrainingSession.cart_item_id)
        )
        for row in comp_result:
            completed_sessions_by_cart[row[0]] = {
                "completed_driving_minutes": float(row[1] or 0),
                "completed_theory_minutes": float(row[2] or 0),
                "completed_sessions_count": row[3],
            }

    # Batch query ClientLessonPlan for transmission type
    plan_by_cart: dict[uuid.UUID, dict] = {}
    plan_ids: set[uuid.UUID] = set()
    if cart_item_ids:
        plan_result = await db.execute(
            select(ClientLessonPlan).where(ClientLessonPlan.cart_item_id.in_(cart_item_ids))
        )
        for plan in plan_result.scalars().all():
            plan_by_cart[plan.cart_item_id] = {
                "transmission_type": plan.transmission_type.value if plan.transmission_type else None,
            }
            plan_ids.add(plan.id)

    # Batch query vehicle info from ClientLessons (first lesson with vehicle per plan)
    vehicle_by_plan: dict[uuid.UUID, dict] = {}
    if plan_ids:
        cl_result = await db.execute(
            select(ClientLesson.lesson_plan_id, ClientLesson.vehicle_id)
            .where(ClientLesson.lesson_plan_id.in_(plan_ids))
            .where(ClientLesson.vehicle_id.isnot(None))
            .distinct(ClientLesson.lesson_plan_id)
        )
        veh_ids = set()
        cl_vehicle_map: dict[uuid.UUID, uuid.UUID] = {}
        for row in cl_result:
            cl_vehicle_map[row.lesson_plan_id] = row.vehicle_id
            veh_ids.add(row.vehicle_id)
        if veh_ids:
            veh_result = await db.execute(
                select(VehicleModel).where(VehicleModel.id.in_(veh_ids))
            )
            vehicles = {v.id: v for v in veh_result.scalars().all()}
            for plan_id, veh_id in cl_vehicle_map.items():
                veh = vehicles.get(veh_id)
                if veh:
                    vehicle_by_plan[plan_id] = {
                        "plate_number": veh.plate_number,
                        "name": veh.name,
                    }

    # Batch query instructor names from started_by phones
    started_by_phones = set(s.started_by for s in sessions if s.started_by)
    user_by_phone: dict[str, str] = {}
    if started_by_phones:
        user_result = await db.execute(
            select(User).where(User.phone.in_(started_by_phones))
        )
        for u in user_result.scalars().all():
            user_by_phone[u.phone] = u.name

    # Batch query product and package names
    product_ids = set(ci.product_id for ci in [s.cart_item for s in sessions])
    product_names: dict[str, str] = {}
    if product_ids:
        pids = [uuid.UUID(pid) for pid in product_ids if isinstance(pid, str)]
        if pids:
            prod_result = await db.execute(
                select(Product).where(Product.id.in_(pids))
            )
            for p in prod_result.scalars().all():
                product_names[str(p.id)] = p.name

    package_ids = set(ci.package_id for ci in [s.cart_item for s in sessions] if ci.package_id)
    package_names: dict[str, str] = {}
    if package_ids:
        pkids = [uuid.UUID(pid) for pid in package_ids if isinstance(pid, str)]
        if pkids:
            pkg_result = await db.execute(
                select(Package).where(Package.id.in_(pkids))
            )
            for pkg in pkg_result.scalars().all():
                package_names[str(pkg.id)] = pkg.name

    schedule = []
    for s in sessions:
        ci = s.cart_item
        consultation = ci.consultation
        status = "pending"
        if s.started_at and s.timer_seconds is not None:
            status = "in_progress"
        elif s.started_at:
            status = "completed"

        # Balance for this consultation (per product)
        cons_payments = payments_by_consultation.get(consultation.id, [])
        product_payments = [p for p in cons_payments if p["product_id"] == ci.product_id] if ci.product_id else cons_payments
        if product_payments:
            total_amount = max(p["total_amount"] for p in product_payments)
            total_paid = sum(p["total_paid"] for p in product_payments)
            balance = max(0, total_amount - total_paid)
        else:
            total_amount = sum(p["total_amount"] for p in cons_payments)
            total_paid = sum(p["total_paid"] for p in cons_payments)
            balance = sum(p["balance"] for p in cons_payments)

        # Lessons left
        completed = completed_sessions_by_cart.get(ci.id, {})
        expected_driving = (ci.driving_training_duration_days or 0) * 30
        expected_theory = (ci.theory_training_hours or 0) * 60
        completed_driving = completed.get("completed_driving_minutes", 0)
        completed_theory = completed.get("completed_theory_minutes", 0)
        driving_remaining = max(0, expected_driving - completed_driving)
        theory_remaining = max(0, expected_theory - completed_theory)

        # Transmission type from ClientLessonPlan
        plan_info = plan_by_cart.get(ci.id, {})
        transmission_type = plan_info.get("transmission_type")

        # Instructor name
        instructor_name = user_by_phone.get(s.started_by) if s.started_by else None

        # Vehicle info from ClientLessonPlan's lessons
        vehicle_info: dict = {}
        if s.lesson_plan_id:
            try:
                lp_id = uuid.UUID(s.lesson_plan_id)
                vehicle_info = vehicle_by_plan.get(lp_id, {})
            except ValueError:
                vehicle_info = {}

        # Lessons left count (each driving lesson = 30 min, each theory session = 60 min)
        driving_lessons_left = math.ceil(driving_remaining / 30) if expected_driving > 0 else 0
        theory_lessons_left = math.ceil(theory_remaining / 60) if expected_theory > 0 else 0

        schedule.append({
            "id": str(s.id),
            "cart_item_id": str(s.cart_item_id),
            "product_id": ci.product_id,
            "package_id": ci.package_id,
            "product_name": product_names.get(ci.product_id),
            "package_name": package_names.get(ci.package_id) if ci.package_id else None,
            "session_date": s.session_date.isoformat(),
            "duration_minutes": s.duration_minutes,
            "theory_minutes": s.theory_minutes,
            "driving_minutes": s.driving_minutes,
            "notes": s.notes,
            "status": status,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "started_by": s.started_by,
            "instructor_name": instructor_name,
            "transmission_type": transmission_type,
            "vehicle_name": vehicle_info.get("name"),
            "vehicle_plate_number": vehicle_info.get("plate_number"),
            "timer_seconds": s.timer_seconds,
            "timer_started_at": s.timer_started_at.isoformat() if s.timer_started_at else None,
            "student_name": f"{consultation.first_name} {consultation.last_name or ''}".strip(),
            "student_phone": consultation.phone,
            "consultation_id": str(consultation.id),
            "total_amount": total_amount,
            "total_paid": total_paid,
            "balance": balance,
            "expected_driving_minutes": expected_driving,
            "expected_theory_minutes": expected_theory,
            "completed_driving_minutes": completed_driving,
            "completed_theory_minutes": completed_theory,
            "driving_remaining_minutes": driving_remaining,
            "theory_remaining_minutes": theory_remaining,
            "driving_lessons_left": driving_lessons_left,
            "theory_lessons_left": theory_lessons_left,
        })
    return schedule


async def get_training_summary(
    db: AsyncSession, cart_item_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> TrainingSummary:
    if not await _verify_cart_item_company(db, cart_item_id, company_id, current_user_role):
        return TrainingSummary(total_driving_minutes=0, total_theory_minutes=0, sessions_count=0)
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


async def _verify_training_session_company(
    db: AsyncSession, session_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    if user_role == UserRole.SUPER_USER or company_id is None:
        return True
    result = await db.execute(
        select(TrainingSession).join(CartItem, TrainingSession.cart_item_id == CartItem.id)
        .join(Consultation, CartItem.consultation_id == Consultation.id)
        .join(Branch, Consultation.branch_id == Branch.id)
        .where(TrainingSession.id == session_id, Branch.company_id == company_id)
    )
    return result.scalar_one_or_none() is not None


async def create_skill(
    db: AsyncSession,
    training_session_id: uuid.UUID,
    name: str,
    description: str | None = None,
    competency_level: int = 1,
    order: int = 0,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Skill:
    if not await _verify_training_session_company(db, training_session_id, company_id, current_user_role):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Training session not found")
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
    db: AsyncSession, training_session_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[Skill]:
    if not await _verify_training_session_company(db, training_session_id, company_id, current_user_role):
        return []
    result = await db.execute(
        select(Skill)
        .where(Skill.training_session_id == training_session_id)
        .order_by(Skill.order)
    )
    return list(result.scalars().all())


async def get_skill_by_id(
    db: AsyncSession, skill_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Skill | None:
    query = select(Skill).where(Skill.id == skill_id)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = (
            query.join(TrainingSession, Skill.training_session_id == TrainingSession.id)
            .join(CartItem, TrainingSession.cart_item_id == CartItem.id)
            .join(Consultation, CartItem.consultation_id == Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(Branch.company_id == company_id)
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()
