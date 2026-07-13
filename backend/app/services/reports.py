import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.commission import Commission, CommissionStatus
from app.models.company import Branch, Expense, ExpenseStatus
from app.models.consultation import Consultation, FollowUp, FollowUpStatus
from app.models.payment import Payment, Installment, InstallmentStatus
from app.models.cart import CartItem, CartItemStatus
from app.models.lesson_plan import ClientLesson, ClientLessonPlan, LessonState
from app.models.user import User
from app.utils.tenant import add_company_filter, add_branch_company_filter


async def get_dashboard_summary(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    branch_ids: Optional[list[uuid.UUID]] = None,
) -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    today_payments = select(func.coalesce(func.sum(Payment.total_paid), 0))
    month_payments = select(func.coalesce(func.sum(Payment.total_paid), 0))

    today_commissions = select(func.coalesce(func.sum(Commission.total_amount), 0)).where(
        Commission.created_at >= today_start
    )
    month_commissions = select(func.coalesce(func.sum(Commission.total_amount), 0)).where(
        Commission.created_at >= month_start
    )
    pending_commissions = select(func.count()).select_from(Commission).where(
        Commission.status == CommissionStatus.PENDING
    )

    month_expenses = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.expense_date >= month_start,
        Expense.status == ExpenseStatus.PAID,
    )

    active_clients = select(func.count()).select_from(
        select(Consultation.id)
        .distinct()
        .join(CartItem, CartItem.consultation_id == Consultation.id)
        .where(
            CartItem.status.in_([
                CartItemStatus.CONVERTED,
                CartItemStatus.CONVERTED_PAID,
                CartItemStatus.CONVERTED_PAYING,
            ])
        )
        .subquery()
    )

    pending_followups = select(func.count()).select_from(FollowUp).where(
        FollowUp.status == FollowUpStatus.PENDING
    )

    upcoming_today = select(func.count()).select_from(
        select(ClientLesson.id)
        .join(ClientLessonPlan, ClientLesson.lesson_plan_id == ClientLessonPlan.id)
        .where(
            ClientLesson.status == LessonState.SCHEDULED,
            func.date(ClientLesson.scheduled_date) == today_start.date(),
        )
        .subquery()
    )

    ongoing = select(func.count()).select_from(
        select(ClientLesson.id)
        .where(ClientLesson.status == LessonState.STARTED)
        .subquery()
    )

    if user_role != "super_user" and company_id is not None:
        branch_subq = select(Branch.id).where(Branch.company_id == company_id).subquery()
        today_payments = today_payments.where(
            Payment.consultation_id.in_(
                select(Consultation.id).where(Consultation.branch_id.in_(select(branch_subq.c.id)))
            )
        )
        month_payments = month_payments.where(
            Payment.consultation_id.in_(
                select(Consultation.id).where(Consultation.branch_id.in_(select(branch_subq.c.id)))
            )
        )
        today_commissions = today_commissions.where(Commission.company_id == company_id)
        month_commissions = month_commissions.where(Commission.company_id == company_id)
        pending_commissions = pending_commissions.where(Commission.company_id == company_id)
        month_expenses = month_expenses.where(
            Expense.branch_id.in_(select(branch_subq.c.id))
        )
        active_clients = active_clients.where(
            Consultation.branch_id.in_(select(branch_subq.c.id))
        )
        pending_followups = pending_followups.where(
            FollowUp.consultation_id.in_(
                select(Consultation.id).where(Consultation.branch_id.in_(select(branch_subq.c.id)))
            )
        )
        upcoming_today = upcoming_today.where(
            ClientLessonPlan.id.in_(
                select(ClientLessonPlan.id)
                .join(CartItem, ClientLessonPlan.cart_item_id == CartItem.id)
                .join(Consultation, CartItem.consultation_id == Consultation.id)
                .where(Consultation.branch_id.in_(select(branch_subq.c.id)))
            )
        )

    if branch_ids:
        today_payments = today_payments.where(
            Payment.consultation_id.in_(
                select(Consultation.id).where(Consultation.branch_id.in_(branch_ids))
            )
        )
        month_payments = month_payments.where(
            Payment.consultation_id.in_(
                select(Consultation.id).where(Consultation.branch_id.in_(branch_ids))
            )
        )
        month_expenses = month_expenses.where(Expense.branch_id.in_(branch_ids))
        active_clients = active_clients.where(Consultation.branch_id.in_(branch_ids))
        pending_followups = pending_followups.where(
            FollowUp.consultation_id.in_(
                select(Consultation.id).where(Consultation.branch_id.in_(branch_ids))
            )
        )

    result = {}

    for key, q in [
        ("total_revenue_today", today_payments),
        ("total_revenue_month", month_payments),
        ("total_expenses_month", month_expenses),
        ("total_commissions_month", month_commissions),
        ("pending_commissions_count", pending_commissions),
        ("active_clients_count", active_clients),
        ("pending_follow_ups_count", pending_followups),
        ("upcoming_lessons_today", upcoming_today),
        ("ongoing_lessons", ongoing),
    ]:
        r = await db.execute(q)
        result[key] = r.scalar() or 0

    from app.services.fuel import get_fuel_alerts
    fuel_alerts = await get_fuel_alerts(db, company_id, user_role)

    return {
        "total_revenue_today": result["total_revenue_today"],
        "total_revenue_month": result["total_revenue_month"],
        "total_expenses_month": result["total_expenses_month"],
        "total_commissions_month": result["total_commissions_month"],
        "active_clients": result["active_clients_count"],
        "pending_follow_ups": result["pending_follow_ups_count"],
        "pending_commissions": result["pending_commissions_count"],
        "fuel_alerts": fuel_alerts,
        "upcoming_lessons_today": result["upcoming_lessons_today"],
        "ongoing_lessons": result["ongoing_lessons"],
    }
