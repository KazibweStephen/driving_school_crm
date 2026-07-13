import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.commission import Commission, CommissionRate, CommissionStatus, CommissionContest, ContestStatus
from app.models.cart import CartItem, CartItemStatus
from app.models.consultation import Consultation
from app.models.user import User
from app.models.product import Package


async def list_commission_rates(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    package_id: Optional[uuid.UUID] = None,
    active_only: bool = False,
) -> list[CommissionRate]:
    query = select(CommissionRate)
    if user_role != "super_user" and company_id is not None:
        query = query.where(CommissionRate.company_id == company_id)
    if package_id:
        query = query.where(CommissionRate.package_id == package_id)
    if active_only:
        today = date.today()
        query = query.where(
            CommissionRate.active_from <= today,
            and_(
                CommissionRate.active_until.is_(None),
                CommissionRate.deactivated_at.is_(None),
            ) | and_(
                CommissionRate.active_until >= today,
                CommissionRate.deactivated_at.is_(None),
            )
        )
    query = query.order_by(CommissionRate.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


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
    total = data["converter_pct"] + data.get("primary_recommender_pct", 0) + data.get("secondary_recommender_pct", 0)
    if total != Decimal("100.00"):
        raise ValueError("Percentages must sum to 100")
    rate = CommissionRate(
        company_id=company_id,
        package_id=data["package_id"],
        total_amount=data["total_amount"],
        converter_pct=data["converter_pct"],
        primary_recommender_pct=data.get("primary_recommender_pct", 0),
        secondary_recommender_pct=data.get("secondary_recommender_pct", 0),
        active_from=data["active_from"],
        active_until=data.get("active_until"),
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
    fields = ("package_id", "total_amount", "converter_pct", "primary_recommender_pct",
              "secondary_recommender_pct", "active_from", "active_until", "notes")
    for field in fields:
        if field in data and data[field] is not None:
            setattr(rate, field, data[field])
    await db.flush()
    return rate


async def deactivate_commission_rate(
    db: AsyncSession,
    rate: CommissionRate,
) -> None:
    rate.deactivated_at = datetime.now(timezone.utc)
    await db.flush()


async def list_commissions(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    converter_id: Optional[str] = None,
    recommender_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Commission], int]:
    query = (
        select(Commission)
        .options(
            joinedload(Commission.converter),
            joinedload(Commission.primary_recommender),
            joinedload(Commission.secondary_recommender),
            joinedload(Commission.cart_item),
            joinedload(Commission.commission_rate),
        )
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(Commission.company_id == company_id)
    if converter_id:
        query = query.where(Commission.converter_id == converter_id)
    if recommender_id:
        query = query.where(
            (Commission.primary_recommender_id == recommender_id) |
            (Commission.secondary_recommender_id == recommender_id)
        )
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


async def create_commission_from_conversion(
    db: AsyncSession,
    cart_item: CartItem,
    company_id: uuid.UUID | None,
    converter_id: str | None = None,
    recommender_id: str | None = None,
) -> Optional[Commission]:
    package_id = uuid.UUID(cart_item.package_id) if cart_item.package_id else None
    if not package_id:
        return None

    rate_query = (
        select(CommissionRate)
        .where(
            CommissionRate.company_id == company_id,
            CommissionRate.package_id == package_id,
            CommissionRate.active_from <= date.today(),
            and_(
                CommissionRate.active_until.is_(None),
                CommissionRate.deactivated_at.is_(None),
            ) | and_(
                CommissionRate.active_until >= date.today(),
                CommissionRate.deactivated_at.is_(None),
            )
        )
        .order_by(CommissionRate.created_at.desc())
        .limit(1)
    )
    result = await db.execute(rate_query)
    rate = result.scalars().first()
    if not rate:
        return None

    total = rate.total_amount
    converter_amt = total * rate.converter_pct / Decimal("100")
    primary_amt = total * rate.primary_recommender_pct / Decimal("100")
    secondary_amt = total * rate.secondary_recommender_pct / Decimal("100")

    commission = Commission(
        company_id=company_id,
        cart_item_id=cart_item.id,
        commission_rate_id=rate.id,
        converter_id=converter_id,
        primary_recommender_id=recommender_id,
        total_amount=total,
        converter_amount=converter_amt,
        primary_recommender_amount=primary_amt,
        secondary_recommender_amount=secondary_amt,
        status=CommissionStatus.PENDING,
    )
    db.add(commission)
    await db.flush()
    return commission


async def compute_maturity(db: AsyncSession, commission: Commission) -> dict:
    from app.models.payment import Payment
    cart_item = commission.cart_item
    if not cart_item:
        return {"maturity_pct": 0, "matured": 0, "remaining": 0}

    package_id = uuid.UUID(cart_item.package_id) if cart_item.package_id else None
    if not package_id:
        return {"maturity_pct": 0, "matured": 0, "remaining": 0}

    pkg_result = await db.execute(select(Package).where(Package.id == package_id))
    package = pkg_result.scalar_one_or_none()
    if not package or package.price == 0:
        return {"maturity_pct": 0, "matured": 0, "remaining": 0}

    result = await db.execute(
        select(func.coalesce(func.sum(Payment.total_paid), 0))
        .where(Payment.consultation_id == cart_item.consultation_id)
    )
    total_paid = result.scalar() or Decimal("0")

    pct = min(total_paid / package.price * Decimal("100"), Decimal("100"))
    return {
        "maturity_pct": pct,
        "matured_converter_amount": commission.converter_amount * pct / Decimal("100"),
        "matured_primary_amount": commission.primary_recommender_amount * pct / Decimal("100"),
        "matured_secondary_amount": commission.secondary_recommender_amount * pct / Decimal("100"),
        "remaining_converter_amount": commission.converter_amount * (Decimal("100") - pct) / Decimal("100"),
        "remaining_primary_amount": commission.primary_recommender_amount * (Decimal("100") - pct) / Decimal("100"),
        "remaining_secondary_amount": commission.secondary_recommender_amount * (Decimal("100") - pct) / Decimal("100"),
    }


async def get_user_commission_summary(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_id: str,
    user_role: str | None = None,
) -> dict:
    query = (
        select(Commission)
        .options(
            joinedload(Commission.cart_item),
            joinedload(Commission.commission_rate),
        )
        .where(
            (Commission.converter_id == user_id) |
            (Commission.primary_recommender_id == user_id) |
            (Commission.secondary_recommender_id == user_id)
        )
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(Commission.company_id == company_id)
    query = query.order_by(Commission.created_at.desc())
    result = await db.execute(query)
    commissions = result.unique().scalars().all()

    items = []
    total_commission = Decimal("0")
    total_matured = Decimal("0")
    total_remaining = Decimal("0")

    for c in commissions:
        maturity = await compute_maturity(db, c)
        role = "converter" if c.converter_id == user_id else \
               "primary_recommender" if c.primary_recommender_id == user_id else \
               "secondary_recommender"

        share_total = c.converter_amount if role == "converter" else \
                      c.primary_recommender_amount if role == "primary_recommender" else \
                      c.secondary_recommender_amount

        share_matured = maturity["matured_converter_amount"] if role == "converter" else \
                        maturity["matured_primary_amount"] if role == "primary_recommender" else \
                        maturity["matured_secondary_amount"]

        share_remaining = maturity["remaining_converter_amount"] if role == "converter" else \
                          maturity["remaining_primary_amount"] if role == "primary_recommender" else \
                          maturity["remaining_secondary_amount"]

        total_commission += share_total
        total_matured += share_matured
        total_remaining += share_remaining

        consultation = await db.execute(
            select(Consultation).where(Consultation.id == c.cart_item.consultation_id)
        )
        client = consultation.scalar_one_or_none()

        pkg_name = None
        if c.commission_rate and c.commission_rate.package:
            pkg_name = c.commission_rate.package.name

        items.append({
            "commission_id": c.id,
            "client_name": client.client_name if client else "Unknown",
            "package_name": pkg_name or "Unknown",
            "total_amount": c.total_amount,
            "converter_amount": c.converter_amount,
            "primary_recommender_amount": c.primary_recommender_amount,
            "secondary_recommender_amount": c.secondary_recommender_amount,
            "maturity_pct": maturity["maturity_pct"],
            "matured_amount": share_matured,
            "remaining_amount": share_remaining,
            "user_role": role,
            "user_share_total": share_total,
            "user_share_matured": share_matured,
            "user_share_remaining": share_remaining,
        })

    return {
        "items": items,
        "total_commission": total_commission,
        "total_matured": total_matured,
        "total_remaining": total_remaining,
    }


async def create_contest(
    db: AsyncSession,
    commission_id: uuid.UUID,
    contested_by_id: str,
    reason: str,
) -> CommissionContest:
    contest = CommissionContest(
        commission_id=commission_id,
        contested_by_id=contested_by_id,
        reason=reason,
    )
    db.add(contest)

    result = await db.execute(select(Commission).where(Commission.id == commission_id))
    commission = result.scalar_one_or_none()
    if commission:
        commission.contest_status = ContestStatus.OPEN
    await db.flush()
    return contest


async def resolve_contest(
    db: AsyncSession,
    contest: CommissionContest,
    resolver_id: str,
    resolution_data: dict,
) -> CommissionContest:
    contest.status = ContestStatus.RESOLVED
    contest.resolution = resolution_data["resolution"]
    contest.resolved_by_id = resolver_id
    contest.resolved_at = datetime.now(timezone.utc)

    commission = await db.execute(select(Commission).where(Commission.id == contest.commission_id))
    commission = commission.scalar_one_or_none()
    if commission:
        if resolution_data.get("new_primary_recommender_id"):
            commission.primary_recommender_id = resolution_data["new_primary_recommender_id"]
        if resolution_data.get("new_secondary_recommender_id"):
            commission.secondary_recommender_id = resolution_data["new_secondary_recommender_id"]
        if resolution_data.get("new_converter_pct") is not None:
            pct = resolution_data["new_converter_pct"]
            commission.converter_amount = commission.total_amount * pct / Decimal("100")
        if resolution_data.get("new_primary_pct") is not None:
            pct = resolution_data["new_primary_pct"]
            commission.primary_recommender_amount = commission.total_amount * pct / Decimal("100")
        if resolution_data.get("new_secondary_pct") is not None:
            pct = resolution_data["new_secondary_pct"]
            commission.secondary_recommender_amount = commission.total_amount * pct / Decimal("100")
        commission.contest_status = ContestStatus.RESOLVED
    await db.flush()
    return contest


async def list_contests(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
) -> list[CommissionContest]:
    query = (
        select(CommissionContest)
        .options(
            joinedload(CommissionContest.contested_by),
            joinedload(CommissionContest.resolved_by),
        )
        .join(Commission, CommissionContest.commission_id == Commission.id)
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(Commission.company_id == company_id)
    query = query.order_by(CommissionContest.created_at.desc())
    result = await db.execute(query)
    return result.unique().scalars().all()
