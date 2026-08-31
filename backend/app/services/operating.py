import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import (
    Branch,
    BranchTransfer,
    Company,
    TransferMethod,
    TransferPool,
    TransferStatus,
)
from app.models.operating import (
    OperatingDirection,
    OperatingEntry,
    OperatingEntryType,
)
from app.models.user import UserRole


# ── helpers (re-inlined from finance to keep operating self-contained) ──


async def _company_head_office_id(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    fallback_branch_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    if company_id is None:
        return None
    comp = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if comp and comp.head_office_branch_id:
        return comp.head_office_branch_id
    return fallback_branch_id


async def _branch_in_company(
    db: AsyncSession,
    branch_id: uuid.UUID,
    company_id: uuid.UUID | None,
) -> Branch | None:
    q = select(Branch).where(Branch.id == branch_id)
    if company_id is not None:
        q = q.where(Branch.company_id == company_id)
    return (await db.execute(q)).scalar_one_or_none()


# ── balance / summary ──


async def _operating_balance(db: AsyncSession, company_id: uuid.UUID) -> float:
    rows = (
        await db.execute(
            select(OperatingEntry.direction, func.coalesce(func.sum(OperatingEntry.amount), 0))
            .where(OperatingEntry.company_id == company_id)
            .group_by(OperatingEntry.direction)
        )
    ).all()
    bal = 0.0
    for direction, amt in rows:
        if direction == OperatingDirection.CREDIT.value:
            bal += float(amt)
        else:
            bal -= float(amt)
    return round(bal, 2)


async def get_summary(db: AsyncSession, company_id: uuid.UUID) -> dict:
    entries = (
        await db.execute(
            select(OperatingEntry).where(OperatingEntry.company_id == company_id)
        )
    ).scalars().all()

    balance = 0.0
    equity = 0.0
    loans_received = 0.0
    loan_repayments = 0.0
    profit = 0.0
    branch_funding_out = 0.0
    operating_expenses = 0.0
    for e in entries:
        amt = float(e.amount)
        if e.direction == OperatingDirection.CREDIT.value:
            balance += amt
        else:
            balance -= amt
        if e.entry_type == OperatingEntryType.EQUITY.value:
            equity += amt
        elif e.entry_type == OperatingEntryType.LOAN.value:
            loans_received += amt
        elif e.entry_type == OperatingEntryType.LOAN_REPAYMENT.value:
            loan_repayments += amt
        elif e.entry_type == OperatingEntryType.PROFIT.value:
            profit += amt
        elif e.entry_type == OperatingEntryType.BRANCH_FUNDING.value:
            branch_funding_out += amt
        elif e.entry_type == OperatingEntryType.OPERATING_EXPENSE.value:
            operating_expenses += amt

    return {
        "balance": round(balance, 2),
        "equity": round(equity, 2),
        "loans_received": round(loans_received, 2),
        "loans_outstanding": round(max(loans_received - loan_repayments, 0), 2),
        "profit": round(profit, 2),
        "branch_funding_out": round(branch_funding_out, 2),
        "operating_expenses": round(operating_expenses, 2),
    }


async def list_entries(db: AsyncSession, company_id: uuid.UUID, limit: int = 200):
    result = await db.execute(
        select(OperatingEntry)
        .where(OperatingEntry.company_id == company_id)
        .order_by(OperatingEntry.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


# ── create entries ──


def _direction_for_type(entry_type: OperatingEntryType) -> OperatingDirection:
    if entry_type in (
        OperatingEntryType.EQUITY,
        OperatingEntryType.LOAN,
        OperatingEntryType.PROFIT,
    ):
        return OperatingDirection.CREDIT
    return OperatingDirection.DEBIT


async def create_entry(
    db: AsyncSession,
    company_id: uuid.UUID,
    entry_type: OperatingEntryType,
    amount: Decimal,
    description: str,
    reference: str | None = None,
    entry_date=None,
    created_by: str | None = None,
) -> OperatingEntry:
    from fastapi import HTTPException
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    direction = _direction_for_type(entry_type)
    entry = OperatingEntry(
        company_id=company_id,
        entry_type=entry_type,
        direction=direction,
        amount=float(amount),
        description=description,
        reference=reference,
        entry_date=entry_date,
        created_by=created_by,
    )
    db.add(entry)
    await db.flush()
    return entry


# ── fund a branch from the operating account ──


async def fund_branch(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    to_branch_id: uuid.UUID,
    pool: str,
    amount: Decimal,
    description: str | None,
    current_user_role: UserRole | None,
    initiated_by: str | None = None,
    method: str | None = None,
) -> BranchTransfer:
    from fastapi import HTTPException

    if company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if pool not in (TransferPool.PETTY_CASH.value, TransferPool.CLIENT_ACCOUNTS.value):
        raise HTTPException(status_code=400, detail="Pool must be petty_cash or client_accounts")

    head_office_id = await _company_head_office_id(db, company_id)
    if not head_office_id:
        raise HTTPException(status_code=400, detail="Head office branch not configured for this company")
    if to_branch_id == head_office_id:
        raise HTTPException(status_code=400, detail="Destination branch cannot be the head office")
    if not await _branch_in_company(db, to_branch_id, company_id):
        raise HTTPException(status_code=404, detail="Branch not found")

    available = await _operating_balance(db, company_id)
    if float(amount) > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient operating balance to fund this branch. Available: {available}.",
        )

    # A company funding of its own branch is received immediately; it does not
    # draw on the branch's own pool (so it can top up a deficit pool).
    transfer = BranchTransfer(
        from_branch_id=head_office_id,
        to_branch_id=to_branch_id,
        amount=float(amount),
        reason=description or "Operating account funding to branch",
        pool=TransferPool(pool),
        method=TransferMethod(method) if method else TransferMethod.CASH,
        received_by=initiated_by,
        received_at=datetime.now(timezone.utc),
        status=TransferStatus.RECEIVED,
        initiated_by=initiated_by,
    )
    db.add(transfer)
    await db.flush()

    entry = OperatingEntry(
        company_id=company_id,
        branch_id=to_branch_id,
        entry_type=OperatingEntryType.BRANCH_FUNDING,
        direction=OperatingDirection.DEBIT,
        amount=float(amount),
        description=description or "Operating account funding to branch",
        transfer_id=transfer.id,
        target_pool=pool,
        created_by=initiated_by,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(transfer)
    return transfer


# ── repay a loan from operating cash (balance profits off loans) ──


async def _loan_outstanding(
    db: AsyncSession,
    loan_entry_id: uuid.UUID,
    company_id: uuid.UUID,
) -> float:
    loan = (
        await db.execute(
            select(OperatingEntry).where(
                OperatingEntry.id == loan_entry_id,
                OperatingEntry.company_id == company_id,
                OperatingEntry.entry_type == OperatingEntryType.LOAN.value,
                OperatingEntry.direction == OperatingDirection.CREDIT.value,
            )
        )
    ).scalar_one_or_none()
    if not loan:
        return None  # not found / not a loan
    repaid = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(OperatingEntry.amount), 0))
                .where(
                    OperatingEntry.loan_entry_id == loan_entry_id,
                    OperatingEntry.entry_type == OperatingEntryType.LOAN_REPAYMENT.value,
                    OperatingEntry.direction == OperatingDirection.DEBIT.value,
                )
            )
        ).scalar()
        or 0
    )
    return round(float(loan.amount) - repaid, 2)


async def repay_loan(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    loan_entry_id: uuid.UUID,
    amount: Decimal,
    description: str | None,
    created_by: str | None = None,
) -> OperatingEntry:
    from fastapi import HTTPException
    if company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    outstanding = await _loan_outstanding(db, loan_entry_id, company_id)
    if outstanding is None:
        raise HTTPException(status_code=404, detail="Loan entry not found")
    if float(amount) > outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"Repayment exceeds the outstanding loan balance ({outstanding}).",
        )
    available = await _operating_balance(db, company_id)
    if float(amount) > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient operating balance to repay the loan. Available: {available}.",
        )
    entry = OperatingEntry(
        company_id=company_id,
        entry_type=OperatingEntryType.LOAN_REPAYMENT,
        direction=OperatingDirection.DEBIT,
        amount=float(amount),
        description=description or "Loan repayment from operating account",
        loan_entry_id=loan_entry_id,
        created_by=created_by,
    )
    db.add(entry)
    await db.flush()
    return entry
