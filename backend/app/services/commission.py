import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.commission import Commission, CommissionRate, CommissionStatus
from app.models.lesson_plan import ClientLesson, ClientLessonPlan
from app.models.user import User


async def list_commission_rates(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
) -> list[CommissionRate]:
    query = select(CommissionRate)
    if user_role != "super_user" and company_id is not None:
        query = query.where(CommissionRate.company_id == company_id)
    query = query.order_by(CommissionRate.created_at.desc())
    result = await db.execute(query)
    return result.unique().scalars().all()


async def get_commission_rate_by_id(
    db: AsyncSession,
    rate_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[CommissionRate]:
    query = select(CommissionRate).where(CommissionRate.id == rate_id)
    if company_id is not None:
        query = query.where(CommissionRate.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_commission_rate(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: dict,
) -> CommissionRate:
    rate = CommissionRate(
        company_id=company_id,
        name=data["name"],
        amount=data["amount"],
        lesson_type=data.get("lesson_type"),
        transmission_type=data.get("transmission_type"),
        is_active=data.get("is_active", True),
        notes=data.get("notes"),
    )
    db.add(rate)
    await db.flush()
    return rate


async def update_commission_rate(
    db: AsyncSession,
    rate: CommissionRate,
    data: dict,
) -> CommissionRate:
    for field in ("name", "amount", "lesson_type", "transmission_type", "is_active", "notes"):
        if field in data and data[field] is not None:
            setattr(rate, field, data[field])
    await db.flush()
    return rate


async def delete_commission_rate(
    db: AsyncSession,
    rate: CommissionRate,
) -> None:
    await db.delete(rate)
    await db.flush()


async def list_commissions(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    instructor_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Commission], int]:
    query = (
        select(Commission)
        .options(
            joinedload(Commission.instructor),
            joinedload(Commission.client_lesson),
            joinedload(Commission.commission_rate),
        )
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(Commission.company_id == company_id)
    if instructor_id:
        query = query.where(Commission.instructor_id == instructor_id)
    if status:
        query = query.where(Commission.status == status)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Commission.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.unique().scalars().all()

    return items, total


async def get_commission_by_id(
    db: AsyncSession,
    commission_id: uuid.UUID,
    company_id: Optional[uuid.UUID],
) -> Optional[Commission]:
    query = select(Commission).where(Commission.id == commission_id)
    if company_id is not None:
        query = query.where(Commission.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_commission(
    db: AsyncSession,
    company_id: uuid.UUID,
    data: dict,
) -> Commission:
    commission = Commission(
        company_id=company_id,
        instructor_id=data["instructor_id"],
        client_lesson_id=data.get("client_lesson_id"),
        training_session_id=data.get("training_session_id"),
        commission_rate_id=data.get("commission_rate_id"),
        amount=data["amount"],
        notes=data.get("notes"),
    )
    db.add(commission)
    await db.flush()
    return commission


async def update_commission(
    db: AsyncSession,
    commission: Commission,
    data: dict,
) -> Commission:
    if "status" in data:
        commission.status = CommissionStatus(data["status"])
    if "paid_at" in data:
        commission.paid_at = data["paid_at"]
    if "paid_by" in data:
        commission.paid_by = data["paid_by"]
    if "notes" in data and data["notes"] is not None:
        commission.notes = data["notes"]
    await db.flush()
    return commission


async def auto_create_commission_for_lesson(
    db: AsyncSession,
    client_lesson: ClientLesson,
    company_id: uuid.UUID,
) -> Optional[Commission]:
    if not client_lesson.instructor_id:
        return None

    rate_query = (
        select(CommissionRate)
        .where(
            CommissionRate.company_id == company_id,
            CommissionRate.is_active == True,
        )
        .order_by(CommissionRate.created_at.desc())
    )
    result = await db.execute(rate_query)
    rate = result.scalars().first()

    amount = rate.amount if rate else Decimal("0.00")

    commission = Commission(
        company_id=company_id,
        instructor_id=client_lesson.instructor_id,
        client_lesson_id=client_lesson.id,
        commission_rate_id=rate.id if rate else None,
        amount=amount,
        status=CommissionStatus.PENDING,
    )
    db.add(commission)
    await db.flush()
    return commission


async def get_commission_report(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    instructor_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[dict]:
    query = (
        select(
            Commission.instructor_id,
            User.name.label("instructor_name"),
            func.count(Commission.id).label("total_count"),
            func.sum(Commission.amount).label("total_commissions"),
            func.sum(
                case((Commission.status == CommissionStatus.PAID, Commission.amount), else_=0)
            ).label("paid_amount"),
            func.sum(
                case((Commission.status == CommissionStatus.PENDING, Commission.amount), else_=0)
            ).label("pending_amount"),
            func.count(
                case((Commission.status == CommissionStatus.PAID, 1))
            ).label("paid_count"),
            func.count(
                case((Commission.status == CommissionStatus.PENDING, 1))
            ).label("pending_count"),
        )
        .join(User, User.phone == Commission.instructor_id)
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(Commission.company_id == company_id)
    if instructor_id:
        query = query.where(Commission.instructor_id == instructor_id)
    if date_from:
        query = query.where(Commission.created_at >= date_from)
    if date_to:
        query = query.where(Commission.created_at <= date_to)

    query = query.group_by(Commission.instructor_id, User.name)
    result = await db.execute(query)
    rows = result.all()

    items = []
    grand_total = Decimal("0.00")
    grand_paid = Decimal("0.00")
    grand_pending = Decimal("0.00")

    for row in rows:
        item = {
            "instructor_id": row.instructor_id,
            "instructor_name": row.instructor_name,
            "total_commissions": row.total_commissions or Decimal("0.00"),
            "total_count": row.total_count or 0,
            "paid_count": row.paid_count or 0,
            "pending_count": row.pending_count or 0,
            "paid_amount": row.paid_amount or Decimal("0.00"),
            "pending_amount": row.pending_amount or Decimal("0.00"),
        }
        grand_total += item["total_commissions"]
        grand_paid += item["paid_amount"]
        grand_pending += item["pending_amount"]
        items.append(item)

    return {
        "items": items,
        "grand_total": grand_total,
        "grand_paid": grand_paid,
        "grand_pending": grand_pending,
    }
