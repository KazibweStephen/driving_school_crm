import uuid
from decimal import Decimal

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import (
    Branch, BranchTransfer, Expense, ExpenseStatus, TransferPool, TransferStatus,
)
from app.models.payment import Payment
from app.models.consultation import Consultation
from app.models.cart import CartItem, CartItemStatus
from app.models.discount import CartItemDiscount
from app.models.operating import (
    OperatingDirection,
    OperatingEntry,
    OperatingEntryType,
)
from app.models.operating_client_post import OperatingClientPost
from app.models.product import Package


OperatingTransferCategory = "Operating Transfer"


async def _head_office(
    db: AsyncSession, company_id: uuid.UUID
) -> Branch | None:
    from app.models.company import Company
    comp = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if not comp or not comp.head_office_branch_id:
        return None
    return (
        await db.execute(select(Branch).where(Branch.id == comp.head_office_branch_id))
    ).scalar_one_or_none()


async def _expected_expense_for_item(
    db: AsyncSession, cart_item: CartItem, company_id: uuid.UUID
) -> float:
    """Uses the conversion-time snapshot when present (keeps already-spent
    packages stable), otherwise computes the live expected total from the
    package's active catalogue links."""
    if cart_item.expected_expense_snapshot is not None:
        return float(cart_item.expected_expense_snapshot)
    if not cart_item.package_id:
        return 0.0
    try:
        pid = uuid.UUID(str(cart_item.package_id))
    except (ValueError, TypeError):
        return 0.0
    from app.models.expected_expense import ExpectedExpenseItem, PackageExpenseLink
    rows = (
        await db.execute(
            select(PackageExpenseLink.multiplier, ExpectedExpenseItem.unit_cost)
            .join(
                ExpectedExpenseItem,
                ExpectedExpenseItem.id == PackageExpenseLink.item_id,
            )
            .where(
                PackageExpenseLink.package_id == pid,
                ExpectedExpenseItem.company_id == company_id,
                ExpectedExpenseItem.is_active.is_(True),
            )
        )
    ).all()
    return round(
        float(sum(float(m) * float(u) for m, u in rows)), 2
    )


async def _account_profit(
    db: AsyncSession,
    consultation_id: uuid.UUID,
    head_office_id: uuid.UUID,
    company_id: uuid.UUID,
) -> tuple[float, float, float]:
    """Returns (confirmed_profit, expected_profit, funds_in_ho_pool) for a
    client account (consultation)."""

    # Payments this account has that sit at head office (client-account pool source)
    ho_payment_sum = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.total_paid), 0)).where(
                Payment.consultation_id == consultation_id,
                Payment.branch_id == head_office_id,
                Payment.cancelled_at.is_(None),
            )
        )
    ).scalar() or Decimal("0")

    cart_items = (
        await db.execute(
            select(CartItem).where(CartItem.consultation_id == consultation_id)
        )
    ).scalars().all()

    # all payments for the account (any branch) to derive net sale + paid per item
    payments = (
        await db.execute(
            select(Payment).where(
                Payment.consultation_id == consultation_id,
                Payment.cancelled_at.is_(None),
            )
        )
    ).scalars().all()

    # discount amounts per cart item
    discounts: dict[uuid.UUID, float] = {}
    if cart_items:
        d_rows = (
            await db.execute(
                select(CartItemDiscount.cart_item_id, CartItemDiscount.applied_amount)
                .where(CartItemDiscount.cart_item_id.in_([c.id for c in cart_items]))
            )
        ).all()
        for ciid, amt in d_rows:
            discounts[ciid] = discounts.get(ciid, 0.0) + float(amt)

    # per-cart-item payment totals
    pay_by_item: dict[tuple[uuid.UUID, str | None], list] = {}
    for p in payments:
        key = (p.consultation_id, p.package_id)
        pay_by_item.setdefault(key, []).append(p)

    confirmed_profit = 0.0
    expected_profit = 0.0

    for ci in cart_items:
        if ci.status in (
            CartItemStatus.CONVERTED,
            CartItemStatus.CONVERTED_PAID,
            CartItemStatus.CONVERTED_PAYING,
        ):
            key = (ci.consultation_id, ci.package_id)
            item_payments = pay_by_item.get(key, [])
            total_due = max(
                (float(p.total_amount) for p in item_payments), default=0.0
            )
            total_paid = sum(float(p.total_paid) for p in item_payments)
            if total_due <= 0:
                continue
            net_sale = total_due  # already price minus discounts
            expected_expense = await _expected_expense_for_item(
                db, ci, company_id
            )
            profit_item = max(net_sale - expected_expense, 0.0)
            expected_profit += profit_item
            # profit confirms as the client pays (installment-aware)
            ratio = 1.0 if total_paid >= total_due else (total_paid / total_due)
            confirmed_profit += profit_item * ratio

    # money in the HO client pool for this account, net of what's already been
    # posted to operating (those posts created paid expenses that reduced the pool).
    already_posted = (
        await db.execute(
            select(func.coalesce(func.sum(OperatingClientPost.amount), 0)).where(
                OperatingClientPost.consultation_id == consultation_id
            )
        )
    ).scalar() or Decimal("0")

    # all funds reaching the HO pool for this account: HO-direct payments plus
    # branch payments remitted to HO (recipient transfers in RECEIVED state).
    # These are disjoint sources so there is no double-count.
    remitted_ho = (
        await db.execute(
            select(func.coalesce(func.sum(BranchTransfer.amount), 0)).where(
                BranchTransfer.consultation_id == consultation_id,
                BranchTransfer.to_branch_id == head_office_id,
                BranchTransfer.status == TransferStatus.RECEIVED,
            )
        )
    ).scalar() or Decimal("0")

    funds = (
        round(float(ho_payment_sum) + float(remitted_ho) - float(already_posted), 2)
    )

    return round(confirmed_profit, 2), round(expected_profit, 2), funds


async def list_client_accounts(
    db: AsyncSession, company_id: uuid.UUID
) -> list[dict]:
    ho = await _head_office(db, company_id)
    if not ho:
        return []
    # consultations with funds at head office: direct HO-branch payments OR
    # branch payments remitted to HO (recipient transfers in RECEIVED state),
    # so clients of any branch whose funds reached HO are postable.
    rows = (
        await db.execute(
            select(Consultation.id, Consultation.phone, Consultation.first_name,
                   Consultation.middle_name, Consultation.last_name)
            .select_from(Consultation)
            .outerjoin(Payment, Payment.consultation_id == Consultation.id)
            .outerjoin(
                BranchTransfer,
                (BranchTransfer.consultation_id == Consultation.id)
                & (BranchTransfer.to_branch_id == ho.id)
                & (BranchTransfer.status == TransferStatus.RECEIVED),
            )
            .where(
                Payment.cancelled_at.is_(None),
                or_(
                    Payment.branch_id == ho.id,
                    BranchTransfer.id.isnot(None),
                ),
            )
            .group_by(Consultation.id)
        )
    ).all()

    accounts = []
    for cid, phone, fn, mn, ln in rows:
        confirmed, expected, funds = await _account_profit(
            db, cid, ho.id, company_id
        )
        name = " ".join(x for x in (fn, mn, ln) if x) or phone
        already_posted = (
            await db.execute(
                select(func.coalesce(func.sum(OperatingClientPost.amount), 0)).where(
                    OperatingClientPost.consultation_id == cid
                )
            )
        ).scalar() or Decimal("0")
        # total owed back to this account (unreconciled excess across posts)
        posts = (
            await db.execute(
                select(OperatingClientPost).where(
                    OperatingClientPost.consultation_id == cid
                )
            )
        ).scalars().all()
        unreconciled_excess = sum(
            float(p.excess) - float(p.reconciled) for p in posts
        )
        accounts.append(
            {
                "consultation_id": str(cid),
                "client_name": name,
                "client_phone": phone,
                "confirmed_profit": confirmed,
                "expected_profit": expected,
                "funds_available": max(funds, 0),
                "already_posted": round(float(already_posted), 2),
                "unreconciled_excess": round(unreconciled_excess, 2),
            }
        )
    accounts.sort(key=lambda a: a["client_name"].lower())
    return accounts


async def post_from_clients(
    db: AsyncSession,
    company_id: uuid.UUID,
    items: list[dict],
    notes: str | None,
    created_by: str | None,
) -> list[dict]:
    from fastapi import HTTPException

    ho = await _head_office(db, company_id)
    if not ho:
        raise HTTPException(status_code=400, detail="Head office branch not configured")

    results = []
    for it in items:
        cid = uuid.UUID(str(it["consultation_id"]))
        amount = float(it["amount"])
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than zero")

        consultation = (
            await db.execute(select(Consultation).where(Consultation.id == cid))
        ).scalar_one_or_none()
        if not consultation:
            raise HTTPException(
                status_code=404, detail=f"Client account {cid} not found"
            )

        confirmed, expected, funds = await _account_profit(db, cid, ho.id, company_id)
        if amount > funds:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Amount {amount} exceeds the funds available in this client "
                    f"account's head office pool (available: {funds})."
                ),
            )

        expense = Expense(
            branch_id=ho.id,
            amount=amount,
            description=notes or f"Transfer from client account to operating account ({it.get('reason') or ''})".strip(),
            category=OperatingTransferCategory,
            account=TransferPool.CLIENT_ACCOUNTS.value,
            consultation_id=cid,
            status=ExpenseStatus.PAID,
            created_by_phone=created_by,
        )
        db.add(expense)
        await db.flush()

        entry = OperatingEntry(
            company_id=company_id,
            branch_id=ho.id,
            consultation_id=cid,
            entry_type=OperatingEntryType.CLIENT_ACCOUNT_POST,
            direction=OperatingDirection.CREDIT,
            amount=amount,
            description=f"Posted from client account {consultation.first_name} {consultation.last_name or ''}".strip(),
            created_by=created_by,
        )
        db.add(entry)
        await db.flush()

        excess = max(amount - confirmed, 0.0)
        post = OperatingClientPost(
            company_id=company_id,
            consultation_id=cid,
            entry_id=entry.id,
            expense_id=expense.id,
            amount=amount,
            confirmed_profit=confirmed,
            excess=excess,
            reconciled=0,
            notes=notes,
            created_by=created_by,
        )
        db.add(post)
        await db.flush()
        results.append(
            {
                "post_id": str(post.id),
                "consultation_id": str(cid),
                "client_name": f"{consultation.first_name} {consultation.last_name or ''}".strip(),
                "amount": amount,
                "confirmed_profit": confirmed,
                "expected_profit": expected,
                "excess": round(excess, 2),
            }
        )
    await db.commit()
    return results


async def owed_to_clients(db: AsyncSession, company_id: uuid.UUID) -> dict:
    posts = (
        await db.execute(
            select(OperatingClientPost).where(
                OperatingClientPost.company_id == company_id
            )
        )
    ).scalars().all()

    total_taken = 0.0
    total_confirmed = 0.0
    total_excess = 0.0
    total_reconciled = 0.0
    per_account: dict[uuid.UUID, dict] = {}
    for p in posts:
        total_taken += float(p.amount)
        total_confirmed += float(p.confirmed_profit)
        total_excess += float(p.excess)
        total_reconciled += float(p.reconciled)
        acc = per_account.setdefault(
            p.consultation_id,
            {"consultation_id": str(p.consultation_id), "posted": 0.0,
             "confirmed_profit": 0.0, "excess": 0.0, "reconciled": 0.0,
             "owed_back": 0.0, "posts": []},
        )
        acc["posted"] += float(p.amount)
        acc["confirmed_profit"] += float(p.confirmed_profit)
        acc["excess"] += float(p.excess)
        acc["reconciled"] += float(p.reconciled)
        post_owed = max(float(p.excess) - float(p.reconciled), 0.0)
        if post_owed > 0:
            acc["posts"].append(
                {
                    "post_id": str(p.id),
                    "amount": round(float(p.amount), 2),
                    "excess": round(float(p.excess), 2),
                    "reconciled": round(float(p.reconciled), 2),
                    "owed_back": round(post_owed, 2),
                }
            )

    for acc in per_account.values():
        acc["owed_back"] = round(max(acc["excess"] - acc["reconciled"], 0), 2)
        for k in ("posted", "confirmed_profit", "excess", "reconciled"):
            acc[k] = round(acc[k], 2)
        acc["posts"] = sorted(acc["posts"], key=lambda x: x["post_id"])

    return {
        "total_taken": round(total_taken, 2),
        "total_confirmed_profit": round(total_confirmed, 2),
        "total_excess": round(total_excess, 2),
        "total_reconciled": round(total_reconciled, 2),
        "total_owed_back": round(max(total_excess - total_reconciled, 0), 2),
        "accounts": list(per_account.values()),
    }


async def reconcile_back(
    db: AsyncSession,
    company_id: uuid.UUID,
    items: list[dict],
    created_by: str | None,
) -> list[dict]:
    """Return money from operating to client accounts, reducing each post's
    associated expense (raising the HO client pool) and recording a DEBIT
    operating entry. Never more than the un-reconciled excess taken per post."""
    from fastapi import HTTPException

    ho = await _head_office(db, company_id)
    if not ho:
        raise HTTPException(status_code=400, detail="Head office branch not configured")

    results = []
    for it in items:
        post_id = uuid.UUID(str(it["post_id"]))
        amount = float(it["amount"])
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than zero")

        post = (
            await db.execute(
                select(OperatingClientPost).where(
                    OperatingClientPost.id == post_id,
                    OperatingClientPost.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if not post:
            raise HTTPException(status_code=404, detail="Post record not found")

        remaining = float(post.excess) - float(post.reconciled)
        if amount > remaining:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Reconciliation {amount} exceeds the excess still owed to "
                    f"this client account (owing: {round(remaining, 2)})."
                ),
            )

        # Raise the head-office client pool by reducing the post's expense.
        if post.expense:
            post.expense.amount = float(post.expense.amount or 0) - amount
            await db.flush()

        entry = OperatingEntry(
            company_id=company_id,
            branch_id=ho.id,
            consultation_id=post.consultation_id,
            entry_type=OperatingEntryType.ACCOUNT_REPAY,
            direction=OperatingDirection.DEBIT,
            amount=amount,
            description="Returned to client account (reconciliation of excess)",
            repays_entry_id=post.entry_id,
            created_by=created_by,
        )
        db.add(entry)
        await db.flush()

        post.reconciled = float(post.reconciled) + amount
        await db.flush()
        results.append(
            {
                "post_id": str(post.id),
                "consultation_id": str(post.consultation_id),
                "amount": amount,
                "reconciled_total": round(float(post.reconciled), 2),
            }
        )
    await db.commit()
    return results
