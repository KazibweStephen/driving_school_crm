import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.fuel import FuelRate, FuelRefueling
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
    if user_role != "super_user" and company_id is not None:
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
