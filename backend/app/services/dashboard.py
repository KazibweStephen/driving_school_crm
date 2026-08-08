import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import (
    Branch,
    BranchMonthlyTarget,
    Company,
    Payment,
    UserBranchAssignment,
)
from app.models.cart import CartItem
from app.models.commission import Commission, CommissionStatus
from app.models.consultation import Consultation
from app.models.lesson_plan import ClientLesson, ClientLessonPlan
from app.models.user import UserRole

PRIVILEGED_ROLES = (
    UserRole.SUPER_USER,
    UserRole.OFFICE_ADMIN,
    UserRole.MANAGER,
    UserRole.BRANCH_SUPERVISOR,
)

DEFAULT_TARGET = 10_000_000.0


async def _resolve_branch_ids(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    user_id: str,
    user_role: UserRole | None,
) -> list[uuid.UUID] | None:
    """Branches accessible to the user.

    Returns None (all branches, no filter) for super users without a company,
    all company branches for privileged roles, otherwise the user's assigned
    branches (possibly empty).
    """
    if company_id is None:
        return None
    if user_role in PRIVILEGED_ROLES:
        result = await db.execute(
            select(Branch.id).where(Branch.company_id == company_id)
        )
        return [row[0] for row in result.all()]
    result = await db.execute(
        select(UserBranchAssignment.branch_id)
        .join(Branch, UserBranchAssignment.branch_id == Branch.id)
        .where(
            UserBranchAssignment.user_id == user_id,
            Branch.company_id == company_id,
        )
    )
    return [row[0] for row in result.all()]


def _branch_filter(branch_ids: list[uuid.UUID] | None):
    """Filter for payments by collecting branch OR onboarded consultation branch."""
    if branch_ids is None:
        return None
    return or_(
        Payment.branch_id.in_(branch_ids),
        Consultation.branch_id.in_(branch_ids),
    )


async def get_mobile_dashboard(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    user_id: str,
    user_role: UserRole | None,
) -> dict:
    today = date.today()
    month_start = today.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)

    branch_ids = await _resolve_branch_ids(db, company_id, user_id, user_role)
    branch_filter = _branch_filter(branch_ids)

    # A payment is a NEW sale when it is the first payment for its consultation;
    # later payments (installment collections, upsells, partial collects) are
    # collections against previously-made sales.
    p2 = aliased(Payment)
    has_prior = exists(
        select(p2.id).where(
            and_(
                p2.consultation_id == Payment.consultation_id,
                p2.created_at < Payment.created_at,
                p2.id != Payment.id,
            )
        )
    )

    # Sales = new-sale value (first payments only, total_amount = package price)
    sales_today_q = (
        select(func.coalesce(func.sum(Payment.total_amount), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(Payment.document_date == today, ~has_prior)
    )
    sales_month_q = (
        select(func.coalesce(func.sum(Payment.total_amount), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(
            Payment.document_date >= month_start,
            Payment.document_date < next_month,
            ~has_prior,
        )
    )
    if branch_filter is not None:
        sales_today_q = sales_today_q.where(branch_filter)
        sales_month_q = sales_month_q.where(branch_filter)

    # Daily collection = all cash received today (new-client payments vs previous-sale collections)
    coll_total_q = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(Payment.document_date == today)
    )
    coll_new_q = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(Payment.document_date == today, ~has_prior)
    )
    pending_q = (
        select(func.coalesce(func.sum(Payment.balance), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(Payment.balance > 0)
    )
    if branch_filter is not None:
        coll_total_q = coll_total_q.where(branch_filter)
        coll_new_q = coll_new_q.where(branch_filter)
        pending_q = pending_q.where(branch_filter)

    sales_today = float((await db.execute(sales_today_q)).scalar() or 0)
    sales_month = float((await db.execute(sales_month_q)).scalar() or 0)
    coll_total = float((await db.execute(coll_total_q)).scalar() or 0)
    coll_new = float((await db.execute(coll_new_q)).scalar() or 0)
    coll_previous = coll_total - coll_new
    pending_collections = float((await db.execute(pending_q)).scalar() or 0)

    # Target: sum of the user's branch monthly targets, fallback to company target
    target = DEFAULT_TARGET
    if branch_ids:
        target_result = await db.execute(
            select(func.coalesce(func.sum(BranchMonthlyTarget.target_amount), 0)).where(
                BranchMonthlyTarget.branch_id.in_(branch_ids),
                BranchMonthlyTarget.month == month_start,
            )
        )
        target = float(target_result.scalar() or 0)
    if not target and company_id is not None:
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

    # Training: lessons completed today / this month + distinct days trained
    def lesson_count_query():
        return (
            select(func.count(ClientLesson.id))
            .select_from(ClientLesson)
            .join(ClientLessonPlan, ClientLesson.lesson_plan_id == ClientLessonPlan.id)
            .join(CartItem, ClientLessonPlan.cart_item_id == CartItem.id)
            .join(Consultation, CartItem.consultation_id == Consultation.id)
            .where(ClientLesson.completed_at.is_not(None))
        )

    today_sessions_q = lesson_count_query().where(
        func.date(ClientLesson.completed_at) == today
    )
    month_sessions_q = lesson_count_query().where(
        func.date(ClientLesson.completed_at) >= month_start,
        func.date(ClientLesson.completed_at) < next_month,
    )
    days_trained_q = (
        select(func.count(func.distinct(func.date(ClientLesson.completed_at))))
        .select_from(ClientLesson)
        .join(ClientLessonPlan, ClientLesson.lesson_plan_id == ClientLessonPlan.id)
        .join(CartItem, ClientLessonPlan.cart_item_id == CartItem.id)
        .join(Consultation, CartItem.consultation_id == Consultation.id)
        .where(
            ClientLesson.completed_at.is_not(None),
            func.date(ClientLesson.completed_at) >= month_start,
            func.date(ClientLesson.completed_at) < next_month,
        )
    )
    if branch_ids is not None:
        today_sessions_q = today_sessions_q.where(Consultation.branch_id.in_(branch_ids))
        month_sessions_q = month_sessions_q.where(Consultation.branch_id.in_(branch_ids))
        days_trained_q = days_trained_q.where(Consultation.branch_id.in_(branch_ids))

    today_sessions = int((await db.execute(today_sessions_q)).scalar() or 0)
    month_sessions = int((await db.execute(month_sessions_q)).scalar() or 0)
    days_trained = int((await db.execute(days_trained_q)).scalar() or 0)

    return {
        "sales_today": sales_today,
        "sales_month": sales_month,
        "monthly_target": target,
        "daily_collection_total": coll_total,
        "daily_collection_new": coll_new,
        "daily_collection_previous": coll_previous,
        "pending_collections": pending_collections,
        "commission_earned": commission_earned,
        "commission_pending": commission_pending,
        "today_training_sessions": today_sessions,
        "month_training_sessions": month_sessions,
        "days_trained": days_trained,
    }
