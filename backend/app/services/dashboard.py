import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Commission, Payment, Company, Branch
from app.models.commission import CommissionStatus
from app.models.user import UserRole


async def get_mobile_dashboard(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    user_id: str,
    user_role: UserRole | None,
) -> dict:
    today = date.today()
    month_start = today.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)

    # Sales
    daily_query = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Branch, Payment.branch_id == Branch.id)
        .where(Payment.document_date == today)
    )
    monthly_query = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Branch, Payment.branch_id == Branch.id)
        .where(
            Payment.document_date >= month_start,
            Payment.document_date < next_month,
        )
    )
    pending_query = (
        select(func.coalesce(func.sum(Payment.balance), Decimal("0")))
        .select_from(Payment)
        .join(Branch, Payment.branch_id == Branch.id)
        .where(Payment.balance > 0)
    )

    if company_id is not None:
        daily_query = daily_query.where(Branch.company_id == company_id)
        monthly_query = monthly_query.where(Branch.company_id == company_id)
        pending_query = pending_query.where(Branch.company_id == company_id)

    daily_sales = float((await db.execute(daily_query)).scalar() or 0)
    monthly_sales = float((await db.execute(monthly_query)).scalar() or 0)
    pending_collections = float((await db.execute(pending_query)).scalar() or 0)

    # Target
    target = 10_000_000.0
    if company_id is not None:
        company_result = await db.execute(
            select(Company.monthly_sales_target).where(Company.id == company_id)
        )
        company_target = company_result.scalar_one_or_none()
        if company_target is not None:
            target = float(company_target)

    # Commission (current month, user-specific)
    commission_base = select(func.coalesce(func.sum(Commission.total_amount), Decimal("0"))).where(
        Commission.created_at >= month_start,
        Commission.created_at < next_month,
    )
    if company_id is not None:
        commission_base = commission_base.where(Commission.company_id == company_id)

    earned_query = commission_base.where(
        (Commission.converter_id == user_id)
        | (Commission.primary_recommender_id == user_id)
        | (Commission.secondary_recommender_id == user_id),
        Commission.status == CommissionStatus.FULLY_MATURED,
    )
    pending_comm_query = commission_base.where(
        (Commission.converter_id == user_id)
        | (Commission.primary_recommender_id == user_id)
        | (Commission.secondary_recommender_id == user_id),
        Commission.status.in_((CommissionStatus.PENDING, CommissionStatus.PARTIALLY_MATURED)),
    )

    commission_earned = float((await db.execute(earned_query)).scalar() or 0)
    commission_pending = float((await db.execute(pending_comm_query)).scalar() or 0)

    return {
        "daily_sales": daily_sales,
        "monthly_sales": monthly_sales,
        "monthly_target": target,
        "pending_collections": pending_collections,
        "commission_earned": commission_earned,
        "commission_pending": commission_pending,
    }
