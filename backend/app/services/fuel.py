import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, and_, case, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.fuel import FuelRate, FuelRefueling, PackageFuelRate
from app.models.lesson_plan import ClientLesson, ClientLessonPlan, LessonState, Vehicle
from app.models.company import Branch
from app.models.cart import CartItem
from app.models.consultation import Consultation
from app.utils.tenant import add_company_filter


async def list_fuel_rates(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    vehicle_id: Optional[uuid.UUID] = None,
    active_only: bool = False,
) -> list[FuelRate]:
    query = (
        select(FuelRate)
        .options(joinedload(FuelRate.vehicle))
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(FuelRate.company_id == company_id)
    if vehicle_id:
        query = query.where(FuelRate.vehicle_id == vehicle_id)
    if active_only:
        query = query.where(FuelRate.is_active == True)
    query = query.order_by(FuelRate.created_at.desc())
    result = await db.execute(query)
    return result.unique().scalars().all()


async def get_fuel_rate_by_id(
    db: AsyncSession,
    rate_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[FuelRate]:
    query = select(FuelRate).where(FuelRate.id == rate_id)
    if company_id is not None:
        query = query.where(FuelRate.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_active_fuel_rate_for_vehicle(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    company_id: uuid.UUID,
) -> Optional[FuelRate]:
    query = (
        select(FuelRate)
        .where(
            FuelRate.vehicle_id == vehicle_id,
            FuelRate.company_id == company_id,
            FuelRate.is_active == True,
        )
        .order_by(FuelRate.effective_from.desc())
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_fuel_rate(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: dict,
) -> FuelRate:
    if data.get("is_active", True):
        await db.execute(
            select(FuelRate).where(
                FuelRate.vehicle_id == data["vehicle_id"],
                FuelRate.company_id == company_id,
                FuelRate.is_active == True,
            )
        )
        await db.execute(
            FuelRate.__table__.update()
            .where(
                FuelRate.vehicle_id == data["vehicle_id"],
                FuelRate.company_id == company_id,
                FuelRate.is_active == True,
            )
            .values(is_active=False)
        )

    rate = FuelRate(
        company_id=company_id,
        vehicle_id=data["vehicle_id"],
        rate_per_lesson=data["rate_per_lesson"],
        is_active=data.get("is_active", True),
        effective_from=data.get("effective_from") or date.today(),
        notes=data.get("notes"),
    )
    db.add(rate)
    await db.flush()
    return rate


async def update_fuel_rate(
    db: AsyncSession,
    rate: FuelRate,
    data: dict,
) -> FuelRate:
    if "is_active" in data and data["is_active"]:
        await db.execute(
            FuelRate.__table__.update()
            .where(
                FuelRate.vehicle_id == rate.vehicle_id,
                FuelRate.company_id == rate.company_id,
                FuelRate.is_active == True,
                FuelRate.id != rate.id,
            )
            .values(is_active=False)
        )

    for field in ("rate_per_lesson", "is_active", "effective_from", "notes"):
        if field in data and data[field] is not None:
            setattr(rate, field, data[field])
    await db.flush()
    return rate


async def delete_fuel_rate(
    db: AsyncSession,
    rate: FuelRate,
) -> None:
    await db.delete(rate)
    await db.flush()


async def list_fuel_refuelings(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    vehicle_id: Optional[uuid.UUID] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[FuelRefueling], int]:
    query = (
        select(FuelRefueling)
        .options(
            joinedload(FuelRefueling.vehicle),
            joinedload(FuelRefueling.fuel_rate),
        )
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(FuelRefueling.company_id == company_id)
    if vehicle_id:
        query = query.where(FuelRefueling.vehicle_id == vehicle_id)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(FuelRefueling.refueled_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.unique().scalars().all()

    return items, total


async def get_fuel_refueling_by_id(
    db: AsyncSession,
    refueling_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[FuelRefueling]:
    query = select(FuelRefueling).where(FuelRefueling.id == refueling_id)
    if company_id is not None:
        query = query.where(FuelRefueling.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_fuel_refueling(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: dict,
) -> FuelRefueling:
    rate = await get_fuel_rate_by_id(db, data["fuel_rate_id"], company_id)
    if not rate:
        raise ValueError("Fuel rate not found")

    lessons_covered = int(data["amount"] / rate.rate_per_lesson)
    if lessons_covered < 1:
        lessons_covered = 1

    refueling = FuelRefueling(
        company_id=company_id,
        vehicle_id=data["vehicle_id"],
        fuel_rate_id=data["fuel_rate_id"],
        amount=data["amount"],
        liters=data.get("liters"),
        lessons_covered=lessons_covered,
        refueled_at=data.get("refueled_at") or datetime.now(timezone.utc),
        odometer_reading=data.get("odometer_reading"),
        notes=data.get("notes"),
    )
    db.add(refueling)
    await db.flush()
    return refueling


async def delete_fuel_refueling(
    db: AsyncSession,
    refueling: FuelRefueling,
) -> None:
    await db.delete(refueling)
    await db.flush()


async def get_fuel_alerts(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
) -> list[dict]:
    vehicle_query = select(Vehicle)
    if company_id is not None:
        vehicle_query = vehicle_query.where(Vehicle.company_id == company_id)
    vehicles_result = await db.execute(vehicle_query)
    vehicles = vehicles_result.scalars().all()

    alerts = []
    for vehicle in vehicles:
        refueling_query = (
            select(FuelRefueling)
            .where(FuelRefueling.vehicle_id == vehicle.id)
            .order_by(FuelRefueling.refueled_at.desc())
            .limit(1)
        )
        if company_id is not None:
            refueling_query = refueling_query.where(FuelRefueling.company_id == company_id)
        refueling_result = await db.execute(refueling_query)
        last_refueling = refueling_result.scalar_one_or_none()

        if not last_refueling:
            continue

        completed_count_query = select(func.count()).select_from(
            ClientLesson.__table__.join(
                ClientLessonPlan, ClientLesson.lesson_plan_id == ClientLessonPlan.id
            )
        ).where(
            ClientLesson.vehicle_id == vehicle.id,
            ClientLesson.status == LessonState.COMPLETED,
            ClientLesson.updated_at >= last_refueling.refueled_at,
        )
        count_result = await db.execute(completed_count_query)
        completed_count = count_result.scalar() or 0

        remaining = last_refueling.lessons_covered - completed_count

        if remaining <= 1:
            alerts.append({
                "vehicle_id": str(vehicle.id),
                "vehicle_name": vehicle.name,
                "vehicle_plate": vehicle.plate_number,
                "remaining_lessons": remaining,
                "last_refueling_id": str(last_refueling.id),
                "last_refueling_date": last_refueling.refueled_at,
                "lessons_covered": last_refueling.lessons_covered,
            })

    return alerts


async def get_vehicle_fuel_status(
    db: AsyncSession,
    vehicle_id: uuid.UUID,
    company_id: uuid.UUID,
) -> Optional[dict]:
    refueling_query = (
        select(FuelRefueling)
        .where(
            FuelRefueling.vehicle_id == vehicle_id,
            FuelRefueling.company_id == company_id,
        )
        .order_by(FuelRefueling.refueled_at.desc())
        .limit(1)
    )
    result = await db.execute(refueling_query)
    last_refueling = result.scalar_one_or_none()

    if not last_refueling:
        return None

    active_rate = await get_active_fuel_rate_for_vehicle(db, vehicle_id, company_id)

    completed_count_query = select(func.count()).select_from(
        ClientLesson.__table__.join(
            ClientLessonPlan, ClientLesson.lesson_plan_id == ClientLessonPlan.id
        )
    ).where(
        ClientLesson.vehicle_id == vehicle_id,
        ClientLesson.status == LessonState.COMPLETED,
        ClientLesson.updated_at >= last_refueling.refueled_at,
    )
    count_result = await db.execute(completed_count_query)
    completed_count = count_result.scalar() or 0

    remaining = last_refueling.lessons_covered - completed_count
    if remaining < 0:
        remaining = 0

    return {
        "last_refueling_id": str(last_refueling.id),
        "last_refueling_amount": last_refueling.amount,
        "lessons_covered": last_refueling.lessons_covered,
        "completed_lessons": completed_count,
        "remaining_lessons": remaining,
        "rate_per_lesson": active_rate.rate_per_lesson if active_rate else None,
        "needs_refueling": remaining <= 1,
    }


async def get_fuel_report(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    vehicle_id: Optional[uuid.UUID] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> dict:
    query = (
        select(
            FuelRefueling.vehicle_id,
            Vehicle.name.label("vehicle_name"),
            Vehicle.plate_number.label("vehicle_plate"),
            func.count(FuelRefueling.id).label("total_refuelings"),
            func.sum(FuelRefueling.amount).label("total_amount"),
            func.sum(FuelRefueling.liters).label("total_liters"),
            func.sum(FuelRefueling.lessons_covered).label("total_lessons_covered"),
        )
        .join(Vehicle, Vehicle.id == FuelRefueling.vehicle_id)
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(FuelRefueling.company_id == company_id)
    if vehicle_id:
        query = query.where(FuelRefueling.vehicle_id == vehicle_id)
    if date_from:
        query = query.where(FuelRefueling.refueled_at >= date_from)
    if date_to:
        query = query.where(FuelRefueling.refueled_at <= date_to)

    query = query.group_by(FuelRefueling.vehicle_id, Vehicle.name, Vehicle.plate_number)
    result = await db.execute(query)
    rows = result.all()

    items = []
    grand_total = Decimal("0.00")
    grand_liters = Decimal("0.00")
    grand_lessons = 0

    for row in rows:
        item = {
            "vehicle_id": row.vehicle_id,
            "vehicle_name": row.vehicle_name,
            "vehicle_plate": row.vehicle_plate,
            "total_refuelings": row.total_refuelings or 0,
            "total_amount": row.total_amount or Decimal("0.00"),
            "total_liters": row.total_liters,
            "total_lessons_covered": row.total_lessons_covered or 0,
        }
        grand_total += item["total_amount"]
        if item["total_liters"]:
            grand_liters += item["total_liters"]
        grand_lessons += item["total_lessons_covered"]
        items.append(item)

    return {
        "items": items,
        "grand_total": grand_total,
        "grand_liters": grand_liters if grand_liters > 0 else None,
        "grand_lessons_covered": grand_lessons,
    }


# ---------------------------------------------------------------------------
# Package fuel rates (maximum expected fuel cost per session)
# ---------------------------------------------------------------------------


async def list_package_fuel_rates(
    db: AsyncSession,
    package_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> list[PackageFuelRate]:
    query = select(PackageFuelRate).where(PackageFuelRate.package_id == package_id)
    if company_id is not None:
        query = query.where(PackageFuelRate.company_id == company_id)
    query = query.order_by(PackageFuelRate.active_from.desc())
    result = await db.execute(query)
    return result.unique().scalars().all()


async def get_package_fuel_rate_by_id(
    db: AsyncSession,
    rate_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[PackageFuelRate]:
    query = select(PackageFuelRate).where(PackageFuelRate.id == rate_id)
    if company_id is not None:
        query = query.where(PackageFuelRate.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_active_package_fuel_rate(
    db: AsyncSession,
    package_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[PackageFuelRate]:
    """Return the single active package fuel rate (not soft-deactivated and
    within its active window)."""
    today = date.today()
    query = (
        select(PackageFuelRate)
        .where(
            PackageFuelRate.package_id == package_id,
            PackageFuelRate.deactivated_at.is_(None),
            PackageFuelRate.active_from <= today,
            or_(
                PackageFuelRate.active_until.is_(None),
                PackageFuelRate.active_until >= today,
            ),
        )
        .order_by(PackageFuelRate.active_from.desc())
        .limit(1)
    )
    if company_id is not None:
        query = query.where(PackageFuelRate.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_package_fuel_rate(
    db: AsyncSession,
    company_id: uuid.UUID,
    package_id: uuid.UUID,
    data: dict,
) -> PackageFuelRate:
    from app.models.product import Package

    pkg = await db.get(Package, package_id)
    if not pkg:
        raise ValueError("Package not found")
    if not pkg.requires_driving_training:
        raise ValueError("Fuel rate requires the package to have practical (driving) training enabled")

    active_from = data.get("active_from") or date.today()
    active_until = data.get("active_until")
    if active_until and active_until < active_from:
        raise ValueError("active_until cannot be before active_from")

    # Deactivate any currently active rate for this package
    await db.execute(
        PackageFuelRate.__table__.update()
        .where(
            PackageFuelRate.package_id == package_id,
            PackageFuelRate.company_id == company_id,
            PackageFuelRate.deactivated_at.is_(None),
        )
        .values(deactivated_at=datetime.now(timezone.utc))
    )

    rate = PackageFuelRate(
        company_id=company_id,
        package_id=package_id,
        fuel_rate_per_session=data["fuel_rate_per_session"],
        active_from=active_from,
        active_until=active_until,
        notes=data.get("notes"),
    )
    db.add(rate)
    await db.flush()
    return rate


async def update_package_fuel_rate(
    db: AsyncSession,
    rate: PackageFuelRate,
    data: dict,
) -> PackageFuelRate:
    for field in ("fuel_rate_per_session", "active_from", "active_until", "deactivated_at", "notes"):
        if field in data and data[field] is not None:
            setattr(rate, field, data[field])
    if rate.active_until and rate.active_from and rate.active_until < rate.active_from:
        raise ValueError("active_until cannot be before active_from")
    await db.flush()
    return rate


async def delete_package_fuel_rate(
    db: AsyncSession,
    rate: PackageFuelRate,
) -> None:
    await db.delete(rate)
    await db.flush()


# ---------------------------------------------------------------------------
# Client plan fuel budget
# ---------------------------------------------------------------------------

async def get_vehicle_active_rate_for_vehicle(
    db: AsyncSession,
    vehicle_id: Optional[uuid.UUID],
    company_id: Optional[uuid.UUID],
) -> Optional[FuelRate]:
    if not vehicle_id:
        return None
    return await get_active_fuel_rate_for_vehicle(db, vehicle_id, company_id)


async def _plan_budget_base(
    db: AsyncSession,
    plan: ClientLessonPlan,
) -> tuple[Optional[Decimal], Decimal]:
    """Return (fuel_rate_per_session snapshot, budget_total)."""
    rate = None
    if plan.cart_item_id:
        ci = await db.get(CartItem, plan.cart_item_id)
        if ci and ci.fuel_rate_per_session is not None:
            rate = ci.fuel_rate_per_session
    days = plan.purchased_days or 0
    budget_total = (Decimal(days) * rate) if rate is not None else Decimal("0.00")
    return rate, budget_total


async def plan_fuel_used(
    db: AsyncSession,
    plan_id: uuid.UUID,
) -> tuple[Decimal, int]:
    """Sum of fuel_cost snapshots across completed lessons in a plan."""
    query = (
        select(func.coalesce(func.sum(ClientLesson.fuel_cost), 0))
        .where(
            ClientLesson.lesson_plan_id == plan_id,
            ClientLesson.status == LessonState.COMPLETED,
        )
    )
    result = await db.execute(query)
    used = Decimal(result.scalar() or 0)
    count_result = await db.execute(
        select(func.count())
        .select_from(ClientLesson)
        .where(
            ClientLesson.lesson_plan_id == plan_id,
            ClientLesson.status == LessonState.COMPLETED,
            ClientLesson.fuel_cost.is_not(None),
        )
    )
    return used, count_result.scalar() or 0


async def plan_projected_fuel(
    db: AsyncSession,
    plan_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Decimal:
    """Projected total fuel = completed lessons' fuel_cost + active rates of
    every non-completed lesson that has a vehicle assigned."""
    lessons_result = await db.execute(
        select(ClientLesson).where(
            ClientLesson.lesson_plan_id == plan_id,
            ClientLesson.is_active == True,
        )
    )
    lessons = lessons_result.scalars().all()

    total = Decimal("0.00")
    vehicle_ids = set()
    for lesson in lessons:
        if lesson.status == LessonState.COMPLETED:
            if lesson.fuel_cost is not None:
                total += Decimal(lesson.fuel_cost)
            continue
        if lesson.is_theory:
            continue
        if lesson.vehicle_id:
            vehicle_ids.add(lesson.vehicle_id)

    for vid in vehicle_ids:
        rate = await get_vehicle_active_rate_for_vehicle(db, vid, company_id)
        if rate:
            total += Decimal(rate.rate_per_lesson)

    return total


async def get_plan_fuel_budget(
    db: AsyncSession,
    plan_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[dict]:
    plan_result = await db.execute(
        select(ClientLessonPlan).where(ClientLessonPlan.id == plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return None

    rate, budget_total = await _plan_budget_base(db, plan)
    used, completed_count = await plan_fuel_used(db, plan_id)
    remaining = budget_total - used
    percent = (float(used) / float(budget_total) * 100.0) if budget_total > 0 else 0.0

    scheduled_count = 0
    scheduled_result = await db.execute(
        select(func.count()).select_from(ClientLesson).where(
            ClientLesson.lesson_plan_id == plan_id,
            ClientLesson.status != LessonState.COMPLETED,
            ClientLesson.vehicle_id.is_not(None),
        )
    )
    scheduled_count = scheduled_result.scalar() or 0

    warning = None
    blocked = False
    if budget_total > 0:
        if remaining < 0:
            blocked = True
            warning = "Fuel budget exceeded"
        elif remaining <= rate:
            warning = "Only one session of fuel remaining"
        elif percent >= 80:
            warning = "Fuel budget nearly exhausted"

    return {
        "plan_id": str(plan.id),
        "cart_item_id": str(plan.cart_item_id) if plan.cart_item_id else None,
        "purchased_days": plan.purchased_days,
        "fuel_rate_per_session": float(rate) if rate is not None else None,
        "budget_total": budget_total,
        "fuel_used": used,
        "remaining": remaining,
        "percent_used": round(percent, 1),
        "completed_lessons": completed_count,
        "scheduled_lessons": scheduled_count,
        "warning": warning,
        "blocked": blocked,
    }


async def get_budget_alerts(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
) -> list[dict]:
    """Client plans whose fuel budget is exhausted or nearly so."""
    query = (
        select(ClientLessonPlan)
        .options(
            joinedload(ClientLessonPlan.cart_item).joinedload(CartItem.consultation)
        )
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(
            ClientLessonPlan.cart_item.has(
                CartItem.consultation.has(
                    Consultation.branch.has(Branch.company_id == company_id)
                )
            )
        )
    plans = (await db.execute(query)).unique().scalars().all()

    alerts = []
    for plan in plans:
        rate, budget_total = await _plan_budget_base(db, plan)
        if rate is None or budget_total <= 0:
            continue
        used, _ = await plan_fuel_used(db, plan.id)
        remaining = budget_total - used
        if remaining < 0:
            warning = "Fuel budget exceeded"
        elif remaining <= rate:
            warning = "Only one session of fuel remaining"
        elif float(used) / float(budget_total) * 100 >= 80:
            warning = "Fuel budget nearly exhausted"
        else:
            continue

        client_name = None
        cart_item = plan.cart_item
        if cart_item and cart_item.consultation:
            c = cart_item.consultation
            client_name = " ".join(
                filter(None, [c.first_name, c.middle_name, c.last_name])
            ) or c.phone

        alerts.append({
            "plan_id": str(plan.id),
            "cart_item_id": str(plan.cart_item_id) if plan.cart_item_id else None,
            "client_name": client_name,
            "purchased_days": plan.purchased_days,
            "fuel_rate_per_session": float(rate),
            "budget_total": budget_total,
            "fuel_used": used,
            "remaining": remaining,
            "percent_used": round(float(used) / float(budget_total) * 100, 1),
            "warning": warning,
        })
    return alerts


async def assert_plan_fuel_budget(
    db: AsyncSession,
    plan_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
    prospective_rate: Optional[Decimal] = None,
) -> None:
    """Raise ValueError if the plan's fuel budget would be exceeded.

    prospective_rate: extra fuel the upcoming action would consume (e.g. the
    active rate of the vehicle a lesson is being started/completed on).
    """
    plan_result = await db.execute(
        select(ClientLessonPlan).where(ClientLessonPlan.id == plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return

    rate, budget_total = await _plan_budget_base(db, plan)
    if rate is None or budget_total <= 0:
        return

    projected = await plan_projected_fuel(db, plan_id, company_id)
    if prospective_rate is not None:
        projected += prospective_rate

    if projected > budget_total:
        short = projected - budget_total
        if prospective_rate is not None:
            raise ValueError(
                f"this lesson would consume an extra {prospective_rate} "
                f"leaving the budget short by {short:.2f}."
            )
        raise ValueError(
            f"projected fuel ({projected:.2f}) exceeds the budget ({budget_total:.2f}) "
            f"by {short:.2f}."
        )
