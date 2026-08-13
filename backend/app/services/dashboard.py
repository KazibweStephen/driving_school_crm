import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, joinedload

from app.models import (
    Branch,
    BranchMonthlyTarget,
    Company,
    Payment,
    UserBranchAssignment,
)
from app.models.cart import CartItem
from app.models.commission import Commission
from app.models.consultation import Consultation
from app.models.lesson_plan import ClientLesson, ClientLessonPlan
from app.models.user import UserRole
from app.services.commission import compute_maturity

PRIVILEGED_ROLES = (
    UserRole.SUPER_USER,
    UserRole.OFFICE_ADMIN,
    UserRole.MANAGER,
    UserRole.BRANCH_SUPERVISOR,
)

DEFAULT_TARGET = 10_000_000.0

VALID_PERIODS = ("today", "yesterday", "this_week", "last_week", "this_month")


def _period_range(period: str) -> tuple[date, date]:
    """Inclusive [start, end] date range for a dashboard period."""
    today = date.today()
    if period == "yesterday":
        d = today - timedelta(days=1)
        return d, d
    if period == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if period == "last_week":
        this_monday = today - timedelta(days=today.weekday())
        return this_monday - timedelta(days=7), this_monday - timedelta(days=1)
    if period == "this_month":
        month_start = today.replace(day=1)
        next_month = (month_start + timedelta(days=32)).replace(day=1)
        return month_start, next_month - timedelta(days=1)
    # today (default)
    return today, today


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


async def _resolve_assigned_branch_ids(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    user_id: str,
) -> list[uuid.UUID]:
    """Only the branches the user is explicitly assigned to (UserBranchAssignment)."""
    if company_id is None:
        return []
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
    period: str = "today",
) -> dict:
    if period not in VALID_PERIODS:
        period = "today"
    period_start, period_end = _period_range(period)

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
    sales_period_q = (
        select(func.coalesce(func.sum(Payment.total_amount), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(
            Payment.document_date.between(period_start, period_end),
            ~has_prior,
        )
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
        sales_period_q = sales_period_q.where(branch_filter)
        sales_month_q = sales_month_q.where(branch_filter)

    # Daily collection = all cash received in the period, split by client
    # registration date: payments for clients registered within the period are
    # NEW; payments collected in the period from earlier clients are PREVIOUS.
    coll_total_q = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(Payment.document_date.between(period_start, period_end))
    )
    coll_new_q = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(
            Payment.document_date.between(period_start, period_end),
            Consultation.document_date.between(period_start, period_end),
        )
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

    sales_period = float((await db.execute(sales_period_q)).scalar() or 0)
    sales_month = float((await db.execute(sales_month_q)).scalar() or 0)
    coll_total = float((await db.execute(coll_total_q)).scalar() or 0)
    coll_new = float((await db.execute(coll_new_q)).scalar() or 0)
    coll_previous = coll_total - coll_new
    pending_collections = float((await db.execute(pending_q)).scalar() or 0)

    # Target: sum of the user's ASSIGNED branch monthly targets for the month.
    # If the current month has no target set, roll forward the most recent month
    # that has one; otherwise fall back to the company target, then a default.
    target = DEFAULT_TARGET
    assigned_branch_ids = await _resolve_assigned_branch_ids(db, company_id, user_id)
    target_branches = assigned_branch_ids or (branch_ids or [])
    if target_branches:
        target_result = await db.execute(
            select(func.coalesce(func.sum(BranchMonthlyTarget.target_amount), 0)).where(
                BranchMonthlyTarget.branch_id.in_(target_branches),
                BranchMonthlyTarget.month == month_start,
            )
        )
        target = float(target_result.scalar() or 0)
        if not target:
            recent_result = await db.execute(
                select(
                    BranchMonthlyTarget.month,
                    func.sum(BranchMonthlyTarget.target_amount),
                )
                .where(BranchMonthlyTarget.branch_id.in_(target_branches))
                .group_by(BranchMonthlyTarget.month)
                .order_by(BranchMonthlyTarget.month.desc())
                .limit(1)
            )
            recent = recent_result.first()
            if recent and recent[1]:
                target = float(recent[1])
    if not target and company_id is not None:
        company_result = await db.execute(
            select(Company.monthly_sales_target).where(Company.id == company_id)
        )
        company_target = company_result.scalar_one_or_none()
        if company_target is not None:
            target = float(company_target)

    # Commission (current month, user-specific): earned = matured share computed
    # on read; pending = the remainder of the user's share.
    comm_query = (
        select(Commission)
        .options(joinedload(Commission.cart_item))
        .where(
            Commission.created_at >= month_start,
            Commission.created_at < next_month,
            or_(
                Commission.converter_id == user_id,
                Commission.primary_recommender_id == user_id,
                Commission.secondary_recommender_id == user_id,
            ),
        )
    )
    if company_id is not None:
        comm_query = comm_query.where(Commission.company_id == company_id)
    user_commissions = list((await db.execute(comm_query)).scalars().all())

    commission_earned = Decimal("0")
    commission_pending = Decimal("0")
    for c in user_commissions:
        maturity = await compute_maturity(db, c)
        if c.converter_id == user_id:
            share_total = c.converter_amount
            share_matured = maturity["matured_converter_amount"]
        elif c.primary_recommender_id == user_id:
            share_total = c.primary_recommender_amount
            share_matured = maturity["matured_primary_amount"]
        else:
            share_total = c.secondary_recommender_amount
            share_matured = maturity["matured_secondary_amount"]
        commission_earned += share_matured
        commission_pending += share_total - share_matured

    commission_earned = float(commission_earned)
    commission_pending = float(commission_pending)

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
        "sales_today": sales_period,
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
