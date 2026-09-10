"""End-of-day reporting service.

Computes daily cash figures for a branch from actual sales / collection /
expense records, carries the previous day's closing cash forward as the
opening balance, and reconciles the office-admin-entered cash count against the
expected figure, flagging a discrepancy immediately (variation != 0).
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.company import Branch, Expense, ExpenseStatus
from app.models.consultation import Consultation
from app.models.end_of_day import EndOfDayReport
from app.models.payment import Payment
from app.schemas.end_of_day import EndOfDaySummary


def _branch_cash_filter(branch_id: uuid.UUID):
    """Payments physically collected at a branch (collecting branch on the
    payment row, falling back to the consultation's branch for legacy rows)."""
    return or_(
        Payment.branch_id == branch_id,
        and_(Payment.branch_id.is_(None), Consultation.branch_id == branch_id),
    )


async def compute_summary(
    db: AsyncSession,
    branch_id: uuid.UUID,
    report_date: date,
) -> EndOfDaySummary:
    """Compute the system's figures for a branch on a given day."""

    async def _one(q):
        return Decimal(str(float((await db.execute(q)).scalar() or 0)))

    cash_filter = _branch_cash_filter(branch_id)
    day = report_date

    # A payment is cash from a NEW sale when it is the first payment recorded
    # for its consultation; every later payment (installments, upsells,
    # partial collects) is cash from collections on an earlier sale.
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

    new_sales_q = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(
            Payment.document_date == day,
            Payment.cancelled_at.is_(None),
            cash_filter,
            ~has_prior,
        )
    )
    collections_q = (
        select(func.coalesce(func.sum(Payment.total_paid), Decimal("0")))
        .select_from(Payment)
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .where(
            Payment.document_date == day,
            Payment.cancelled_at.is_(None),
            cash_filter,
            has_prior,
        )
    )
    expenses_q = (
        select(
            func.coalesce(
                func.sum(
                    Expense.amount
                    + func.coalesce(Expense.paid_charges, Expense.charges, 0)
                ),
                Decimal("0"),
            )
        ).where(
            Expense.branch_id == branch_id,
            Expense.status == ExpenseStatus.PAID,
            func.date(Expense.paid_at) == day,
        )
    )

    consultations_q = (
        select(func.count(Consultation.id)).where(
            Consultation.document_date == day,
            Consultation.branch_id == branch_id,
        )
    )
    # New client = a phone whose earliest consultation anywhere in the company
    # is dated today (a phone with any earlier consultation is not new).
    c2 = aliased(Consultation)
    new_clients_q = (
        select(func.count(func.distinct(Consultation.phone))).where(
            Consultation.document_date == day,
            Consultation.branch_id == branch_id,
            ~exists(
                select(1)
                .select_from(c2)
                .where(
                    c2.phone == Consultation.phone,
                    c2.document_date < day,
                    c2.document_date.isnot(None),
                )
            ),
        )
    )

    cash_from_new_sales = await _one(new_sales_q)
    cash_from_collections = await _one(collections_q)
    cash_expenses = await _one(expenses_q)
    cash_in = cash_from_new_sales + cash_from_collections
    cash_out = cash_expenses
    net_cash = cash_in - cash_out
    opening_cash = await get_previous_closing(db, branch_id, day)
    expected_cash_at_hand = opening_cash + net_cash

    system_consultations_count = int((await db.execute(consultations_q)).scalar() or 0)
    system_new_clients_count = int((await db.execute(new_clients_q)).scalar() or 0)

    return EndOfDaySummary(
        opening_cash=float(opening_cash),
        cash_from_new_sales=float(cash_from_new_sales),
        cash_from_collections=float(cash_from_collections),
        cash_expenses=float(cash_expenses),
        cash_in=float(cash_in),
        cash_out=float(cash_out),
        net_cash=float(net_cash),
        expected_cash_at_hand=float(expected_cash_at_hand),
        system_consultations_count=system_consultations_count,
        system_new_clients_count=system_new_clients_count,
    )


async def get_previous_closing(
    db: AsyncSession,
    branch_id: uuid.UUID,
    report_date: date,
) -> Decimal:
    """Opening cash = the most recent saved report's closing (cash_at_hand)
    before the given date for the same branch; 0 when none exists."""
    result = await db.execute(
        select(EndOfDayReport)
        .where(
            EndOfDayReport.branch_id == branch_id,
            EndOfDayReport.report_date < report_date,
        )
        .order_by(EndOfDayReport.report_date.desc())
        .limit(1)
    )
    report = result.scalar_one_or_none()
    return report.cash_at_hand if report else Decimal("0")


async def get_saved_report(
    db: AsyncSession,
    branch_id: uuid.UUID,
    report_date: date,
) -> EndOfDayReport | None:
    result = await db.execute(
        select(EndOfDayReport).where(
            EndOfDayReport.branch_id == branch_id,
            EndOfDayReport.report_date == report_date,
        )
    )
    return result.scalar_one_or_none()


async def upsert_report(
    db: AsyncSession,
    company_id: uuid.UUID,
    branch_id: uuid.UUID,
    report_date: date,
    cash_at_hand: Decimal,
    consultations_count: int,
    new_clients_count: int,
    notes: str | None,
    created_by_phone: str | None,
    total_expenses: Decimal | None = None,
) -> EndOfDayReport:
    summary = await compute_summary(db, branch_id, report_date)
    system_expenses = Decimal(str(summary.cash_expenses))
    expected = Decimal(str(summary.expected_cash_at_hand))
    variation = cash_at_hand - expected
    # Entered total expenses defaults to the system's paid-expense figure so a
    # fresh entry reconciles on expenses; a different figure is a discrepancy
    # that must be explained (missing expense records) or corrected.
    entered_expenses = total_expenses if total_expenses is not None else system_expenses
    expense_variation = entered_expenses - system_expenses

    report = await get_saved_report(db, branch_id, report_date)
    if report is None:
        report = EndOfDayReport(
            company_id=company_id,
            branch_id=branch_id,
            report_date=report_date,
            created_by_phone=created_by_phone,
        )
        db.add(report)

    report.cash_at_hand = cash_at_hand
    report.total_expenses = entered_expenses
    report.consultations_count = consultations_count
    report.new_clients_count = new_clients_count
    report.notes = notes
    report.opening_cash = Decimal(str(summary.opening_cash))
    report.cash_from_new_sales = Decimal(str(summary.cash_from_new_sales))
    report.cash_from_collections = Decimal(str(summary.cash_from_collections))
    report.cash_expenses = system_expenses
    report.cash_in = Decimal(str(summary.cash_in))
    report.cash_out = Decimal(str(summary.cash_out))
    report.net_cash = Decimal(str(summary.net_cash))
    report.expected_cash_at_hand = expected
    report.variation = variation
    report.expense_variation = expense_variation
    report.status = (
        "matched"
        if variation == 0 and expense_variation == 0
        else "discrepancy"
    )

    await db.flush()
    await db.refresh(report)
    return report


async def get_branch_name(db: AsyncSession, branch_id: uuid.UUID) -> str | None:
    result = await db.execute(select(Branch.name).where(Branch.id == branch_id))
    return result.scalar_one_or_none()