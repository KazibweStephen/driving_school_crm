"""Week / month / quarter / year period reporting.

Answers the management question "how did the period go?" in one call:
sales vs collections, how much of the cash came from pre-existing (old) client
balances, consultation and conversion counts, expenses, progress against the
sales goal, the best selling products, the best performing staff, and the
clients who have gone quiet with money still outstanding.

Money is reported on the **document date** of the payment (the convention used
by the payments list and the end-of-day report) so backdated entries land in the
period the user filed them under, and every timestamp column is folded through
``at_business_tz`` so a payment made at 01:00 Kampala time is never attributed
to the previous day.

New sale vs collection follows the established end-of-day rule: a payment is
cash from a NEW sale when it is the first payment recorded for its
consultation; every later payment for that consultation is a collection against
an earlier sale. The same EXISTS subquery drives both, so this report and the
end-of-day accounting always agree.
"""

from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.cart import CartItem, CartItemStatus
from app.models.company import Branch, BranchMonthlyTarget, Company, Expense, ExpenseStatus
from app.models.consultation import Consultation
from app.models.payment import Payment
from app.models.product import Package, Product
from app.models.user import User
from app.utils.timezones import at_business_tz, today_local

PERIODS = ("week", "month", "quarter", "year")

CONVERTED_STATUSES = (
    CartItemStatus.CONVERTED,
    CartItemStatus.CONVERTED_PAID,
    CartItemStatus.CONVERTED_PAYING,
)

DEFAULT_RISK_DAYS = 14
DEFAULT_TOP_N = 10


# --------------------------------------------------------------------------- #
# period maths
# --------------------------------------------------------------------------- #
def month_start(d: date) -> date:
    return d.replace(day=1)


def month_end(d: date) -> date:
    return d.replace(day=monthrange(d.year, d.month)[1])


def add_months(d: date, months: int) -> date:
    """Shift by whole months, clamping the day (31 Jan + 1 month -> 28/29 Feb)."""
    total = (d.year * 12 + (d.month - 1)) + months
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(d.day, monthrange(year, month)[1]))


def resolve_period(period: str, anchor: date | None = None) -> tuple[date, date]:
    """Return the inclusive (start, end) dates for a period around ``anchor``.

    Week runs Monday-Sunday, matching the dashboard's ``this_week``.
    """
    a = anchor or today_local()
    if period == "week":
        start = a - timedelta(days=a.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        return month_start(a), month_end(a)
    if period == "quarter":
        first_month = ((a.month - 1) // 3) * 3 + 1
        start = date(a.year, first_month, 1)
        return start, month_end(add_months(start, 2))
    if period == "year":
        return date(a.year, 1, 1), date(a.year, 12, 31)
    raise ValueError(f"Unsupported period: {period}")


def period_label(period: str, start: date, end: date) -> str:
    if period == "week":
        return f"Week {start.isocalendar()[1]} · {start:%d %b} – {end:%d %b %Y}"
    if period == "month":
        return f"{start:%B %Y}"
    if period == "quarter":
        return f"Q{(start.month - 1) // 3 + 1} {start.year}"
    if period == "year":
        return f"Year {start.year}"
    return f"{start:%d %b %Y} – {end:%d %b %Y}"


def months_in_period(start: date, end: date) -> list[date]:
    """First-of-month markers covering the period (a week can straddle two)."""
    months: list[date] = []
    cur = month_start(start)
    while cur <= end:
        months.append(cur)
        cur = add_months(cur, 1)
    return months


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def _f(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def payment_day() -> Any:
    """The day a payment is reported under: its document date, else its created day."""
    return func.coalesce(Payment.document_date, func.date(at_business_tz(Payment.created_at)))


def consultation_day() -> Any:
    return func.coalesce(
        Consultation.document_date, func.date(at_business_tz(Consultation.created_at))
    )


def _has_prior_payment():
    """EXISTS: an earlier payment exists for the same consultation."""
    prior = Payment.__table__.alias("prior_payment")
    return exists(
        select(prior.c.id).where(
            and_(
                prior.c.consultation_id == Payment.consultation_id,
                or_(
                    prior.c.created_at < Payment.created_at,
                    and_(prior.c.created_at == Payment.created_at, prior.c.id < Payment.id),
                ),
                prior.c.id != Payment.id,
            )
        )
    )


def _not_cancelled_as_of(day: date):
    """A payment that had not been cancelled as of ``day`` (end of that day)."""
    return or_(
        Payment.cancelled_at.is_(None),
        func.date(at_business_tz(Payment.cancelled_at)) > day,
    )


#: Aliased consultation used purely for branch resolution in payment queries.
_Cons = aliased(Consultation)


def _payment_scope(branch_ids: list[uuid.UUID], include_unassigned: bool):
    """Conditions restricting `Payment` rows to the branches being reported.

    A payment's branch is the branch that *received* the cash; legacy rows were
    never stamped, so the client's branch is the fallback. Rows where neither is
    set are genuinely unassigned (branch-less consultations) and are only folded
    in for a caller who can already see every branch, so a single-branch user
    never has another branch's unassigned money added to their totals.

    The caller must have joined `Consultation` as `_Cons`.
    """
    if not branch_ids:
        return None
    scope = func.coalesce(Payment.branch_id, _Cons.branch_id).in_(branch_ids)
    if include_unassigned:
        scope = or_(
            scope,
            and_(Payment.branch_id.is_(None), _Cons.branch_id.is_(None)),
        )
    return scope


def _consultation_scope(branch_ids: list[uuid.UUID], include_unassigned: bool):
    if not branch_ids:
        return None
    scope = Consultation.branch_id.in_(branch_ids)
    if include_unassigned:
        scope = or_(scope, and_(include_unassigned, Consultation.branch_id.is_(None)))
    return scope


async def covers_all_company_branches(
    db: AsyncSession, company_id: uuid.UUID | None, branch_ids: list[uuid.UUID]
) -> bool:
    """True when the resolved set already spans every branch in scope."""
    query = select(func.count()).select_from(Branch)
    if company_id is not None:
        query = query.where(Branch.company_id == company_id)
    total_branches = int((await db.execute(query)).scalar() or 0)
    if total_branches == 0:
        return False
    return len(set(branch_ids)) >= total_branches


def _grouped_balances(
    db: AsyncSession,
    branch_ids: list[uuid.UUID],
    as_of: date | None = None,
    include_unassigned: bool = False,
):
    """Per (consultation, product, package) money still owed.

    ``as_of`` restricts the window to payments filed up to that day, which makes
    the figure a true period-end snapshot; ``None`` means "right now".
    Only packages that actually converted count — an interested/consulting cart
    item is not a debt.
    """
    day = payment_day()
    conds = [
        Payment.consultation_id.isnot(None),
        _not_cancelled_as_of(as_of) if as_of else Payment.cancelled_at.is_(None),
    ]
    if as_of is not None:
        conds.append(day <= as_of)
    branch_filter = _payment_scope(branch_ids, include_unassigned)
    if branch_filter is not None:
        conds.append(branch_filter)

    converted = (
        select(
            CartItem.consultation_id.label("cid"),
            CartItem.product_id.label("pid"),
            CartItem.package_id.label("pkg"),
        )
        .where(CartItem.status.in_(CONVERTED_STATUSES))
        .distinct()
        .subquery()
    )

    grouped = (
        select(
            Payment.consultation_id.label("cid"),
            Payment.product_id.label("pid"),
            Payment.package_id.label("pkg"),
            func.max(Payment.total_amount).label("due"),
            func.sum(Payment.total_paid).label("paid"),
        )
        .select_from(Payment)
        .join(_Cons, _Cons.id == Payment.consultation_id)
        .where(and_(*conds))
        .group_by(Payment.consultation_id, Payment.product_id, Payment.package_id)
        .subquery()
    )

    outstanding = (
        select(
            grouped.c.cid,
            grouped.c.pid,
            grouped.c.pkg,
            (grouped.c.due - grouped.c.paid).label("balance"),
        )
        .select_from(grouped)
        .join(
            converted,
            and_(
                converted.c.cid == grouped.c.cid,
                converted.c.pid == grouped.c.pid,
                converted.c.pkg == grouped.c.pkg,
            ),
        )
        .where(grouped.c.due - grouped.c.paid > 0)
        .subquery()
    )
    return outstanding


# --------------------------------------------------------------------------- #
# the report
# --------------------------------------------------------------------------- #
async def build_period_report(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    branch_ids: list[uuid.UUID],
    period: str = "month",
    anchor: date | None = None,
    risk_days: int = DEFAULT_RISK_DAYS,
    top_n: int = DEFAULT_TOP_N,
    include_unassigned: bool = False,
) -> dict[str, Any]:
    if period not in PERIODS:
        raise ValueError(f"Unsupported period: {period}")

    start, end = resolve_period(period, anchor)
    today = today_local()
    day = payment_day()
    in_period = and_(day >= start, day <= end)

    # ---------------- sales vs collections ------------------------------- #
    prior = _has_prior_payment()
    cash_conds = [Payment.cancelled_at.is_(None), in_period]
    branch_filter = _payment_scope(branch_ids, include_unassigned)
    if branch_filter is not None:
        cash_conds.append(branch_filter)

    async def _cash(cond) -> tuple[float, int]:
        row = (
            await db.execute(
                select(
                    func.coalesce(func.sum(Payment.total_paid), 0),
                    func.count(func.distinct(Payment.id)),
                )
                .select_from(Payment)
                .join(_Cons, _Cons.id == Payment.consultation_id)
                .where(and_(*cash_conds), cond)
            )
        ).one()
        return _f(row[0]), int(row[1])

    total_sales, sales_payments = await _cash(~prior)
    total_collections, collection_payments = await _cash(prior)
    total_cash = total_sales + total_collections

    # cash from clients that already existed before the period started
    old_client_row = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.total_paid), 0))
            .select_from(Payment)
            .join(_Cons, _Cons.id == Payment.consultation_id)
            .where(
                and_(*cash_conds),
                prior,
                func.date(at_business_tz(_Cons.created_at)) < start,
            )
        )
    ).scalar()
    old_client_collections = _f(old_client_row)

    # ---------------- consultations & conversions ------------------------ #
    cons_conds = [consultation_day() >= start, consultation_day() <= end]
    cons_branch = _consultation_scope(branch_ids, include_unassigned)
    if cons_branch is not None:
        cons_conds.append(cons_branch)
    consultations = int(
        (await db.execute(select(func.count()).select_from(Consultation).where(and_(*cons_conds)))).scalar()
        or 0
    )

    # a conversion = a package that received its FIRST payment in the period
    first_pay_conds = [Payment.cancelled_at.is_(None), Payment.consultation_id.isnot(None)]
    first_branch = _payment_scope(branch_ids, include_unassigned)
    if first_branch is not None:
        first_pay_conds.append(first_branch)
    first_payments = (
        select(
            Payment.consultation_id.label("cid"),
            Payment.product_id.label("pid"),
            Payment.package_id.label("pkg"),
            func.min(day).label("first_day"),
        )
        .select_from(Payment)
        .join(_Cons, _Cons.id == Payment.consultation_id)
        .where(and_(*first_pay_conds))
        .group_by(Payment.consultation_id, Payment.product_id, Payment.package_id)
        .subquery()
    )
    conversions = int(
        (
            await db.execute(
                select(func.count())
                .select_from(first_payments)
                .where(first_payments.c.first_day >= start, first_payments.c.first_day <= end)
            )
        ).scalar()
        or 0
    )
    converted_clients = int(
        (
            await db.execute(
                select(func.count(func.distinct(first_payments.c.cid))).where(
                    first_payments.c.first_day >= start, first_payments.c.first_day <= end
                )
            )
        ).scalar()
        or 0
    )

    # ---------------- outstanding (as at period end) ---------------------- #
    period_end_balances = _grouped_balances(
        db, branch_ids, as_of=end, include_unassigned=include_unassigned
    )
    outstanding_total = _f(
        (
            await db.execute(
                select(func.coalesce(func.sum(period_end_balances.c.balance), 0)).select_from(
                    period_end_balances
                )
            )
        ).scalar()
    )
    outstanding_clients = int(
        (
            await db.execute(
                select(func.count(func.distinct(period_end_balances.c.cid))).select_from(
                    period_end_balances
                )
            )
        ).scalar()
        or 0
    )

    # ---------------- expenses ------------------------------------------ #
    exp_conds: list[Any] = []
    exp_branch = Expense.branch_id.in_(branch_ids) if branch_ids else None
    if exp_branch is not None:
        exp_conds.append(exp_branch)

    filed_row = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(Expense.amount + func.coalesce(Expense.paid_charges, Expense.charges, 0)),
                    0,
                ),
                func.count(Expense.id),
            ).where(
                and_(*exp_conds, func.date(at_business_tz(Expense.expense_date)) >= start,
                     func.date(at_business_tz(Expense.expense_date)) <= end)
            )
        )
    ).one()
    paid_row = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(Expense.amount + func.coalesce(Expense.paid_charges, Expense.charges, 0)),
                    0,
                ),
                func.count(Expense.id),
            ).where(
                and_(*exp_conds, Expense.status == ExpenseStatus.PAID,
                     func.date(at_business_tz(Expense.paid_at)) >= start,
                     func.date(at_business_tz(Expense.paid_at)) <= end)
            )
        )
    ).one()
    pending_row = (
        await db.execute(
            select(func.count(Expense.id)).where(
                and_(*exp_conds, Expense.status.in_((ExpenseStatus.PENDING, ExpenseStatus.APPROVED)))
            )
        )
    ).scalar()

    expenses_filed = _f(filed_row[0])
    expenses_paid = _f(paid_row[0])
    expenses_pending_count = int(pending_row or 0)

    # ---------------- goal ----------------------------------------------- #
    target, target_source = await _period_target(db, company_id, branch_ids, start, end)
    attainment = (total_sales / target * 100.0) if target else 0.0

    # ---------------- best selling products ------------------------------ #
    best_products = await _best_selling_products(
        db, branch_ids, start, end, top_n, include_unassigned
    )

    # ---------------- best performing staff ------------------------------ #
    top_performers = await _top_performers(
        db, branch_ids, start, end, top_n, include_unassigned
    )

    # ---------------- clients at risk ------------------------------------ #
    at_risk = await _clients_at_risk(
        db, branch_ids, today, risk_days, top_n * 3, include_unassigned
    )

    return {
        "period": period,
        "period_label": period_label(period, start, end),
        "period_start": start,
        "period_end": end,
        "generated_at": datetime.now(),
        "branch_ids": branch_ids,
        "totals": {
            "total_sales": total_sales,
            "sales_payments": sales_payments,
            "total_collections": total_collections,
            "collection_payments": collection_payments,
            "total_cash_received": total_cash,
            "old_client_collections": old_client_collections,
            "new_client_cash": total_cash - old_client_collections,
            "old_client_share": (old_client_collections / total_cash * 100.0) if total_cash else 0.0,
            "consultations": consultations,
            "conversions": conversions,
            "converted_clients": converted_clients,
            "conversion_rate": (conversions / consultations * 100.0) if consultations else 0.0,
            "outstanding_total": outstanding_total,
            "outstanding_clients": outstanding_clients,
            "expenses_filed": expenses_filed,
            "expenses_filed_count": int(filed_row[1]),
            "expenses_paid": expenses_paid,
            "expenses_paid_count": int(paid_row[1]),
            "expenses_pending_count": expenses_pending_count,
            "net_cash": total_cash - expenses_paid,
        },
        "goal": {
            "target": target,
            "attained": total_sales,
            "attainment_pct": attainment,
            "remaining": max(0.0, target - total_sales),
            "status": _goal_status(attainment),
            "source": target_source,
        },
        "best_selling_products": best_products,
        "top_performers": top_performers,
        "at_risk_clients": at_risk["items"],
        "at_risk_total": at_risk["total"],
        "risk_days": risk_days,
    }


def _goal_status(attainment: float) -> str:
    if attainment >= 100:
        return "achieved"
    if attainment >= 75:
        return "on_track"
    if attainment >= 50:
        return "behind"
    return "at_risk"


async def _period_target(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    branch_ids: list[uuid.UUID],
    start: date,
    end: date,
) -> tuple[float, str]:
    """Sales goal covering the period.

    Branch monthly targets are the primary source (a target is a *new sales*
    figure for one branch-month). When a month has no target the most recent
    earlier month that does is rolled forward, and failing everything the
    company-wide default is used per month.
    """
    months = months_in_period(start, end)
    total = 0.0
    used_branch_targets = False
    company_default = 10_000_000.0
    if company_id is not None:
        company_default = _f(
            (
                await db.execute(
                    select(Company.monthly_sales_target).where(Company.id == company_id)
                )
            ).scalar()
            or 0.0
        ) or company_default

    for m in months:
        month_value = 0.0
        if branch_ids:
            month_value = _f(
                (
                    await db.execute(
                        select(func.coalesce(func.sum(BranchMonthlyTarget.target_amount), 0)).where(
                            BranchMonthlyTarget.branch_id.in_(branch_ids),
                            BranchMonthlyTarget.month == m,
                        )
                    )
                ).scalar()
            )
            if month_value <= 0:
                # roll forward to the most recent month that has a target
                month_value = _f(
                    (
                        await db.execute(
                            select(func.coalesce(func.sum(BranchMonthlyTarget.target_amount), 0))
                            .where(
                                BranchMonthlyTarget.branch_id.in_(branch_ids),
                                BranchMonthlyTarget.month <= m,
                            )
                            .group_by(BranchMonthlyTarget.month)
                            .order_by(BranchMonthlyTarget.month.desc())
                            .limit(1)
                        )
                    ).scalar()
                )
        if month_value > 0:
            used_branch_targets = True
            total += month_value
        else:
            total += company_default

    return total, ("branch_monthly_targets" if used_branch_targets else "company_default")


async def _best_selling_products(
    db: AsyncSession,
    branch_ids: list[uuid.UUID],
    start: date,
    end: date,
    top_n: int,
    include_unassigned: bool = False,
) -> list[dict[str, Any]]:
    day = payment_day()
    conds = [Payment.cancelled_at.is_(None), day >= start, day <= end]
    branch_filter = _payment_scope(branch_ids, include_unassigned)
    if branch_filter is not None:
        conds.append(branch_filter)

    rows = (
        await db.execute(
            select(
                Payment.product_id,
                Payment.package_id,
                func.coalesce(func.sum(Payment.total_paid), 0).label("amount"),
                func.count(func.distinct(Payment.consultation_id)).label("clients"),
                func.count(func.distinct(Payment.id)).label("payments"),
            )
            .select_from(Payment)
            .join(_Cons, _Cons.id == Payment.consultation_id)
            .where(and_(*conds))
            .group_by(Payment.product_id, Payment.package_id)
            .order_by(func.sum(Payment.total_paid).desc())
            .limit(top_n)
        )
    ).all()

    product_ids: set[uuid.UUID] = set()
    package_ids: set[uuid.UUID] = set()
    for pid, pkg, *_ in rows:
        for raw, bucket in ((pid, product_ids), (pkg, package_ids)):
            if not raw:
                continue
            try:
                bucket.add(uuid.UUID(str(raw)))
            except (ValueError, AttributeError, TypeError):
                continue

    products = {
        p.id: p.name
        for p in (await db.execute(select(Product).where(Product.id.in_(product_ids)))).scalars().all()
    } if product_ids else {}
    packages = {
        p.id: p.name
        for p in (await db.execute(select(Package).where(Package.id.in_(package_ids)))).scalars().all()
    } if package_ids else {}

    out: list[dict[str, Any]] = []
    for pid, pkg, amount, clients, payments in rows:
        product_name, package_name = "—", "—"
        try:
            if pid:
                product_name = products.get(uuid.UUID(str(pid)), "—")
            if pkg:
                package_name = packages.get(uuid.UUID(str(pkg)), "—")
        except (ValueError, AttributeError, TypeError):
            pass
        out.append(
            {
                "product_id": pid,
                "package_id": pkg,
                "product_name": product_name,
                "package_name": package_name,
                "amount": _f(amount),
                "clients": int(clients or 0),
                "payments": int(payments or 0),
            }
        )
    return out


async def _top_performers(
    db: AsyncSession,
    branch_ids: list[uuid.UUID],
    start: date,
    end: date,
    top_n: int,
    include_unassigned: bool = False,
) -> list[dict[str, Any]]:
    """Sales attributed to the staff member credited on the cart item
    (``converter_id``) plus the cash they booked (``created_by_phone``)."""
    day = payment_day()
    conds = [Payment.cancelled_at.is_(None), day >= start, day <= end]
    branch_filter = _payment_scope(branch_ids, include_unassigned)
    if branch_filter is not None:
        conds.append(branch_filter)

    sales_rows = (
        await db.execute(
            select(
                CartItem.converter_id,
                func.coalesce(func.sum(Payment.total_paid), 0).label("amount"),
                func.count(func.distinct(CartItem.consultation_id)).label("clients"),
            )
            .select_from(Payment)
            .join(_Cons, _Cons.id == Payment.consultation_id)
            .join(
                CartItem,
                and_(
                    CartItem.consultation_id == Payment.consultation_id,
                    CartItem.product_id == Payment.product_id,
                    CartItem.package_id == Payment.package_id,
                ),
            )
            .where(and_(*conds), CartItem.converter_id.isnot(None))
            .group_by(CartItem.converter_id)
        )
    ).all()

    collect_rows = (
        await db.execute(
            select(
                Payment.created_by_phone,
                func.coalesce(func.sum(Payment.total_paid), 0).label("amount"),
                func.count(func.distinct(Payment.consultation_id)).label("clients"),
            )
            .select_from(Payment)
            .join(_Cons, _Cons.id == Payment.consultation_id)
            .where(and_(*conds), Payment.created_by_phone.isnot(None))
            .group_by(Payment.created_by_phone)
        )
    ).all()

    merged: dict[str, dict[str, Any]] = {}
    for phone, amount, clients in sales_rows:
        entry = merged.setdefault(
            phone, {"phone": phone, "sales": 0.0, "clients": 0, "collected": 0.0, "payment_clients": 0}
        )
        entry["sales"] = _f(amount)
        entry["clients"] = int(clients or 0)
    for phone, amount, clients in collect_rows:
        entry = merged.setdefault(
            phone, {"phone": phone, "sales": 0.0, "clients": 0, "collected": 0.0, "payment_clients": 0}
        )
        entry["collected"] = _f(amount)
        entry["payment_clients"] = int(clients or 0)

    ranked = sorted(
        merged.values(), key=lambda e: (e["sales"], e["collected"]), reverse=True
    )[:top_n]
    if not ranked:
        return []

    phones = [e["phone"] for e in ranked]
    users = {
        u.phone: u
        for u in (await db.execute(select(User).where(User.phone.in_(phones)))).scalars().all()
    }
    for entry in ranked:
        user = users.get(entry["phone"])
        entry["name"] = user.name if user else entry["phone"]
        entry["role"] = user.role.value if user else ""
    return ranked


async def _clients_at_risk(
    db: AsyncSession,
    branch_ids: list[uuid.UUID],
    today: date,
    risk_days: int,
    limit: int,
    include_unassigned: bool = False,
) -> dict[str, Any]:
    """Clients still owing money who have not paid for `risk_days` days.

    A client with no payment at all counts once their consultation is older
    than the window, so brand-new sign-ups are not flagged.
    """
    outstanding = _grouped_balances(
        db, branch_ids, as_of=None, include_unassigned=include_unassigned
    )

    last_payment = (
        select(
            Payment.consultation_id.label("cid"),
            func.max(
                func.coalesce(Payment.document_date, func.date(at_business_tz(Payment.created_at)))
            ).label("last_day"),
        )
        .where(Payment.cancelled_at.is_(None))
        .group_by(Payment.consultation_id)
        .subquery()
    )

    per_client = (
        select(
            outstanding.c.cid,
            func.sum(outstanding.c.balance).label("balance"),
            func.max(last_payment.c.last_day).label("last_day"),
        )
        .select_from(outstanding)
        .outerjoin(last_payment, last_payment.c.cid == outstanding.c.cid)
        .group_by(outstanding.c.cid)
        .subquery()
    )

    cutoff = today - timedelta(days=risk_days)
    stale = or_(per_client.c.last_day.is_(None), per_client.c.last_day <= cutoff)

    conds: list[Any] = [stale]
    cons_scope = _consultation_scope(branch_ids, include_unassigned)
    if cons_scope is not None:
        conds.append(cons_scope)

    rows = (
        await db.execute(
            select(
                per_client.c.cid,
                per_client.c.balance,
                per_client.c.last_day,
                Consultation.first_name,
                Consultation.middle_name,
                Consultation.last_name,
                Consultation.phone,
                Consultation.branch_id,
                consultation_day().label("consulted_day"),
            )
            .select_from(per_client)
            .join(Consultation, Consultation.id == per_client.c.cid)
            .where(and_(*conds))
            .order_by(per_client.c.last_day.asc().nullsfirst())
            .limit(limit)
        )
    ).all()

    total = int(
        (
            await db.execute(
                select(func.count()).select_from(per_client).join(
                    Consultation, Consultation.id == per_client.c.cid
                ).where(and_(*conds))
            )
        ).scalar()
        or 0
    )

    branch_ids_seen = {r.branch_id for r in rows if r.branch_id}
    branches = {
        b.id: b.name
        for b in (
            await db.execute(select(Branch).where(Branch.id.in_(branch_ids_seen)))
        ).scalars().all()
    } if branch_ids_seen else {}

    items: list[dict[str, Any]] = []
    for cid, balance, last_day, first, middle, last, phone, branch_id, consulted_day in rows:
        if last_day is None:
            idle = (today - consulted_day).days if consulted_day else risk_days
            since = None
        else:
            idle = (today - last_day).days
            since = last_day
        items.append(
            {
                "consultation_id": cid,
                "client_name": " ".join(filter(None, [first, middle, last])).strip() or "—",
                "phone": phone,
                "branch_id": branch_id,
                "branch_name": branches.get(branch_id, "—") if branch_id else "—",
                "balance": _f(balance),
                "last_payment_date": since,
                "days_since_payment": idle,
                "consultation_date": consulted_day,
            }
        )
    return {"items": items, "total": total}
