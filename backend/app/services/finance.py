import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import (
    BorrowedMoney,
    BorrowStatus,
    Branch,
    BranchTransfer,
    Company,
    Collection,
    CollectionStatus,
    Expense,
    ExpenseCategory,
    ExpenseStatus,
    TransferMethod,
    TransferPaymentLink,
    TransferPool,
    TransferStatus,
    UserBranchAssignment,
)
from app.models.consultation import Consultation
from app.models.payment import Installment, InstallmentStatus, Payment
from app.models.user import UserRole
from app.services.notification import on_installment_overdue, on_expense_approved


# ── Expenses ──


async def list_expenses(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    status: ExpenseStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
    category: str | None = None,
    category_not: str | None = None,
) -> tuple[list[Expense], int]:
    query = select(Expense).options(
        selectinload(Expense.created_by_user),
        selectinload(Expense.approved_by_user),
        selectinload(Expense.paid_by_user),
        selectinload(Expense.consultation),
    )
    count_query = select(func.count(Expense.id))

    effective_branch_ids = branch_ids if branch_ids else ([branch_id] if branch_id else None)
    if effective_branch_ids:
        query = query.where(Expense.branch_id.in_(effective_branch_ids))
        count_query = count_query.where(Expense.branch_id.in_(effective_branch_ids))
    if company_id is not None:
        query = query.join(Branch, Expense.branch_id == Branch.id).where(Branch.company_id == company_id)
        count_query = count_query.join(Branch, Expense.branch_id == Branch.id).where(Branch.company_id == company_id)
    if status:
        query = query.where(Expense.status == status)
        count_query = count_query.where(Expense.status == status)
    if category:
        query = query.where(Expense.category == category)
        count_query = count_query.where(Expense.category == category)
    if category_not:
        query = query.where(or_(Expense.category != category_not, Expense.category.is_(None)))
        count_query = count_query.where(or_(Expense.category != category_not, Expense.category.is_(None)))

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Expense.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    expenses = list(result.scalars().all())

    return expenses, total


async def _verify_branch_company(
    db: AsyncSession, branch_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    if company_id is None:
        return True
    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.company_id == company_id)
    )
    return result.scalar_one_or_none() is not None


async def _verify_consultation_company(
    db: AsyncSession, consultation_id: uuid.UUID,
    company_id: uuid.UUID | None, user_role: UserRole | None,
) -> bool:
    if company_id is None:
        return True
    result = await db.execute(
        select(Consultation)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .where(
            Consultation.id == consultation_id,
            or_(Consultation.branch_id.is_(None), Branch.company_id == company_id),
        )
    )
    return result.scalar_one_or_none() is not None


async def create_expense(
    db: AsyncSession,
    branch_id: uuid.UUID,
    amount: float,
    description: str | None = None,
    category: str | None = None,
    consultation_id: uuid.UUID | None = None,
    mileage: int | None = None,
    vehicle_id: uuid.UUID | None = None,
    expense_date: datetime | None = None,
    status: str = "pending",
    receipt_url: str | None = None,
    account: str | None = None,
    created_by_phone: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Expense:
    if not await _verify_branch_company(db, branch_id, company_id, current_user_role):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Branch not found")
    if consultation_id is not None:
        if not await _verify_consultation_company(db, consultation_id, company_id, current_user_role):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Client not found")
    if not account and category and company_id is not None:
        match = (
            await db.execute(
                select(ExpenseCategory).where(
                    ExpenseCategory.company_id == company_id,
                    ExpenseCategory.name == category,
                )
            )
        ).scalar_one_or_none()
        if match is not None:
            account = match.account or "petty_cash"
    expense = Expense(
        branch_id=branch_id,
        amount=amount,
        description=description,
        category=category,
        account=account or "petty_cash",
        consultation_id=consultation_id,
        mileage=mileage,
        vehicle_id=vehicle_id,
        expense_date=expense_date or datetime.now(timezone.utc),
        status=ExpenseStatus(status),
        receipt_url=receipt_url,
        created_by_phone=created_by_phone,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense)
    return expense


async def get_expense(
    db: AsyncSession,
    expense_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Expense | None:
    query = select(Expense).options(
        selectinload(Expense.consultation),
        selectinload(Expense.created_by_user),
        selectinload(Expense.approved_by_user),
        selectinload(Expense.paid_by_user),
    ).where(Expense.id == expense_id)
    if company_id is not None:
        query = query.join(Branch, Expense.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_expense(
    db: AsyncSession,
    expense_id: uuid.UUID,
    status: str | None = None,
    approved_by: str | None = None,
    approved_at: datetime | None = None,
    paid_by: str | None = None,
    paid_at: datetime | None = None,
    rejection_reason: str | None = None,
    receipt_url: str | None = None,
    consultation_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Expense | None:
    query = select(Expense).where(Expense.id == expense_id)
    if company_id is not None:
        query = query.join(Branch, Expense.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    expense = result.scalar_one_or_none()
    if not expense:
        return None

    if status is not None:
        expense.status = ExpenseStatus(status)
    if approved_by is not None:
        expense.approved_by = approved_by
    if approved_at is not None:
        expense.approved_at = approved_at
    elif status == "approved" and approved_at is None:
        expense.approved_at = datetime.now(timezone.utc)
    if paid_by is not None:
        expense.paid_by = paid_by
    if paid_at is not None:
        expense.paid_at = paid_at
    elif status == "paid" and paid_at is None:
        expense.paid_at = datetime.now(timezone.utc)
        expense.paid_by = approved_by  # default to the approver
    if rejection_reason is not None:
        expense.rejection_reason = rejection_reason
    if receipt_url is not None:
        expense.receipt_url = receipt_url
    if consultation_id is not None:
        expense.consultation_id = consultation_id

    await db.flush()
    await db.refresh(expense)
    return expense


# ── Borrowed Money ──


async def list_borrowed(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    status: BorrowStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> tuple[list[BorrowedMoney], int]:
    query = select(BorrowedMoney)
    count_query = select(func.count(BorrowedMoney.id))

    effective_branch_ids = branch_ids if branch_ids else ([branch_id] if branch_id else None)
    if effective_branch_ids:
        query = query.where(BorrowedMoney.branch_id.in_(effective_branch_ids))
        count_query = count_query.where(BorrowedMoney.branch_id.in_(effective_branch_ids))
    if company_id is not None:
        query = query.join(Branch, BorrowedMoney.branch_id == Branch.id).where(Branch.company_id == company_id)
        count_query = count_query.join(Branch, BorrowedMoney.branch_id == Branch.id).where(Branch.company_id == company_id)
    if status:
        query = query.where(BorrowedMoney.status == status)
        count_query = count_query.where(BorrowedMoney.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(BorrowedMoney.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items, total


async def create_borrowed(
    db: AsyncSession,
    branch_id: uuid.UUID,
    direction: str = "borrow",
    amount: Decimal | None = None,
    interest_rate: float | None = None,
    description: str | None = None,
    lender_name: str | None = None,
    borrower_name: str | None = None,
    due_date: datetime | None = None,
    created_by_phone: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> BorrowedMoney:
    if not await _verify_branch_company(db, branch_id, company_id, current_user_role):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Branch not found")
    item = BorrowedMoney(
        branch_id=branch_id,
        direction=direction,
        amount=float(amount) if amount else 0.0,
        interest_rate=interest_rate,
        description=description,
        lender_name=lender_name,
        borrower_name=borrower_name,
        due_date=due_date,
        created_by_phone=created_by_phone,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_borrowed(
    db: AsyncSession,
    item_id: uuid.UUID,
    direction: str | None = None,
    amount: Decimal | None = None,
    interest_rate: float | None = None,
    description: str | None = None,
    lender_name: str | None = None,
    borrower_name: str | None = None,
    due_date: datetime | None = None,
    status: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> BorrowedMoney | None:
    query = select(BorrowedMoney).where(BorrowedMoney.id == item_id)
    if company_id is not None:
        query = query.join(Branch, BorrowedMoney.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        return None

    if direction is not None:
        item.direction = direction
    if amount is not None:
        item.amount = float(amount)
    if interest_rate is not None:
        item.interest_rate = interest_rate
    if description is not None:
        item.description = description
    if lender_name is not None:
        item.lender_name = lender_name
    if borrower_name is not None:
        item.borrower_name = borrower_name
    if due_date is not None:
        item.due_date = due_date
    if status is not None:
        item.status = BorrowStatus(status)

    await db.flush()
    await db.refresh(item)
    return item


# ── Collections ──


async def list_collections(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    status: CollectionStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> tuple[list[Collection], int]:
    query = select(Collection).options(
        selectinload(Collection.installment),
        selectinload(Collection.consultation),
    )
    count_query = select(func.count(Collection.id))

    effective_branch_ids = branch_ids if branch_ids else ([branch_id] if branch_id else None)
    if effective_branch_ids:
        query = (
            query.join(Consultation, Collection.consultation_id == Consultation.id)
            .where(Consultation.branch_id.in_(effective_branch_ids))
        )
        count_query = (
            count_query.join(Consultation, Collection.consultation_id == Consultation.id)
            .where(Consultation.branch_id.in_(effective_branch_ids))
        )
    if company_id is not None:
        query = query.join(Consultation, Collection.consultation_id == Consultation.id)
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
        count_query = count_query.join(Consultation, Collection.consultation_id == Consultation.id)
        count_query = count_query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    if status:
        query = query.where(Collection.status == status)
        count_query = count_query.where(Collection.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Collection.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    collections = list(result.unique().scalars().all())

    return collections, total


async def create_collection(
    db: AsyncSession,
    installment_id: uuid.UUID,
    consultation_id: uuid.UUID,
    amount_due: Decimal,
    amount_collected: Decimal = Decimal("0.00"),
    notes: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Collection:
    if company_id is not None:
        c_result = await db.execute(
            select(Consultation).join(Branch, Consultation.branch_id == Branch.id).where(
                Consultation.id == consultation_id,
                Branch.company_id == company_id,
            )
        )
        if not c_result.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Consultation not found")
    collection = Collection(
        installment_id=installment_id,
        consultation_id=consultation_id,
        amount_due=float(amount_due),
        amount_collected=float(amount_collected),
        notes=notes,
    )
    db.add(collection)
    await db.flush()
    await db.refresh(collection)
    return collection


async def update_collection(
    db: AsyncSession,
    collection_id: uuid.UUID,
    amount_collected: Decimal | None = None,
    status: CollectionStatus | None = None,
    notes: str | None = None,
    collected_by: str | None = None,
    collected_at: datetime | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Collection | None:
    query = select(Collection).where(Collection.id == collection_id)
    if company_id is not None:
        query = query.join(Consultation, Collection.consultation_id == Consultation.id)
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    if not collection:
        return None

    if amount_collected is not None:
        collection.amount_collected = float(amount_collected)
    if status is not None:
        collection.status = status
    if notes is not None:
        collection.notes = notes
    if collected_by is not None:
        collection.collected_by = collected_by
    if collected_at is not None:
        collection.collected_at = collected_at
    elif status == CollectionStatus.COLLECTED and collected_at is None:
        collection.collected_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(collection)
    return collection


async def get_overdue_installments(db: AsyncSession) -> list[Installment]:
    today = date.today()
    result = await db.execute(
        select(Installment)
        .options(selectinload(Installment.payment).selectinload(Payment.consultation))
        .where(
            Installment.status == InstallmentStatus.PENDING,
            Installment.due_date < today,
        )
    )
    return list(result.scalars().all())


async def create_collection_for_installment(
    db: AsyncSession,
    installment_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> Collection | None:
    result = await db.execute(
        select(Installment)
        .options(selectinload(Installment.payment).selectinload(Payment.consultation))
        .where(Installment.id == installment_id)
    )
    installment = result.scalar_one_or_none()
    if not installment:
        return None
    if company_id is not None:
        c_result = await db.execute(
            select(Consultation).join(Branch, Consultation.branch_id == Branch.id).where(
                Consultation.id == installment.payment.consultation_id,
                Branch.company_id == company_id,
            )
        )
        if not c_result.scalar_one_or_none():
            return None

    consultation = installment.payment.consultation
    collection = Collection(
        installment_id=installment.id,
        consultation_id=consultation.id,
        amount_due=float(installment.amount),
        amount_collected=0.0,
    )
    db.add(collection)
    await db.flush()
    await db.refresh(collection)
    return collection


async def get_dunning_list(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[dict]:
    today = date.today()
    query = (
        select(Installment)
        .options(
            selectinload(Installment.payment).selectinload(Payment.consultation),
        )
        .where(
            Installment.status == InstallmentStatus.PENDING,
            Installment.due_date < today,
        )
    )
    if company_id is not None:
        query = query.join(Payment, Installment.payment_id == Payment.id)
        query = query.join(Consultation, Payment.consultation_id == Consultation.id)
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    result = await db.execute(query)
    installments = list(result.scalars().all())

    dunning_list = []
    for inst in installments:
        consultation = inst.payment.consultation
        if branch_id and consultation.branch_id != branch_id:
            continue
        days_overdue = (today - inst.due_date).days
        dunning_list.append({
            "installment_id": inst.id,
            "consultation_id": consultation.id,
            "client_name": f"{consultation.first_name} {consultation.last_name or ''}".strip(),
            "client_phone": consultation.phone,
            "amount_due": inst.amount,
            "due_date": inst.due_date,
            "days_overdue": days_overdue,
            "total_balance": inst.payment.balance,
        })
    return dunning_list


async def send_dunning_notifications(db: AsyncSession) -> int:
    from app.models.branch import Branch
    today = date.today()
    result = await db.execute(
        select(Installment)
        .options(
            selectinload(Installment.payment).selectinload(Payment.consultation),
        )
        .where(
            Installment.status == InstallmentStatus.PENDING,
            Installment.due_date < today,
        )
    )
    installments = list(result.scalars().all())

    sent_count = 0
    for inst in installments:
        consultation = inst.payment.consultation
        days_overdue = (today - inst.due_date).days

        company_id = None
        if consultation.branch_id:
            branch = await db.get(Branch, consultation.branch_id)
            if branch:
                company_id = branch.company_id

        ok = await on_installment_overdue(
            db=db,
            company_id=company_id,
            phone=consultation.phone,
            name=consultation.first_name,
            overdue_amount=str(inst.amount),
            days_overdue=days_overdue,
            total_balance=str(inst.payment.balance),
        ) if company_id else False
        if ok:
            sent_count += 1
            inst.status = InstallmentStatus.OVERDUE
            await db.flush()

            collection_result = await db.execute(
                select(Collection).where(
                    Collection.installment_id == inst.id,
                    Collection.status == CollectionStatus.PENDING,
                )
            )
            collection = collection_result.scalar_one_or_none()
            if collection:
                collection.dunning_count = Collection.dunning_count + 1
                collection.last_dunning_at = datetime.now(timezone.utc)
            else:
                coll = Collection(
                    installment_id=inst.id,
                    consultation_id=consultation.id,
                    amount_due=float(inst.amount),
                    amount_collected=0.0,
                    dunning_count=1,
                    last_dunning_at=datetime.now(timezone.utc),
                )
                db.add(coll)
            await db.flush()

    return sent_count


# ── Branch Transfers ──


async def _verify_branches_in_company(
    db: AsyncSession,
    branch_ids: list[uuid.UUID],
    company_id: uuid.UUID | None,
    user_role: UserRole | None,
) -> bool:
    if company_id is None:
        return True
    result = await db.execute(
        select(Branch).where(Branch.id.in_(branch_ids), Branch.company_id == company_id)
    )
    return len(list(result.scalars().all())) == len(set(branch_ids))


_TRANSFER_PRIVILEGED_ROLES = frozenset(
    {
        UserRole.SUPER_USER,
        UserRole.COMPANY_SUPER_USER,
        UserRole.OFFICE_ADMIN,
        UserRole.MANAGER,
        UserRole.BRANCH_SUPERVISOR,
    }
)


def _transfer_role_privileged(role: UserRole | None) -> bool:
    """Whether a role may operate on branch transfers at any branch of its
    company (mirrors resolve_branch_ids' privileged definition)."""
    return role is not None and role in _TRANSFER_PRIVILEGED_ROLES


async def _user_assigned_branch_ids(
    db: AsyncSession,
    phone: str | None,
    company_id: uuid.UUID | None = None,
) -> set[uuid.UUID]:
    """Return the set of branch IDs a user is assigned to (empty set if the
    user is None — a missing user is not branch-restricted)."""
    if not phone:
        return set()
    query = (
        select(UserBranchAssignment.branch_id)
        .join(Branch, UserBranchAssignment.branch_id == Branch.id)
        .where(UserBranchAssignment.user_id == phone)
    )
    if company_id is not None:
        query = query.where(Branch.company_id == company_id)
    result = await db.execute(query)
    return set(row[0] for row in result.all())


async def pool_available(
    db: AsyncSession,
    branch_id: uuid.UUID,
    pool: str,
) -> float:
    """Available (net) cash in a pool at a branch.

    Client Accounts available = collected client payments
        - paid client-account expenses - client-account remittances (initiated+received).
    Petty Cash available = petty transfers received into the branch
        - paid petty expenses - petty remittances (initiated+received).
    A negative result means the pool is already overspent; transfers and
    expense-payments must not make it worse."""
    async def _one(q):
        return float((await db.execute(q)).scalar() or 0)

    if pool == TransferPool.CLIENT_ACCOUNTS.value:
        collected = await _one(
            select(func.coalesce(func.sum(Payment.total_paid), 0))
            .where(Payment.branch_id == branch_id, Payment.cancelled_at.is_(None))
        )
        received = await _one(
            select(func.coalesce(func.sum(BranchTransfer.amount), 0))
            .where(
                BranchTransfer.to_branch_id == branch_id,
                BranchTransfer.pool == TransferPool.CLIENT_ACCOUNTS,
                BranchTransfer.status == TransferStatus.RECEIVED,
                BranchTransfer.cancelled_at.is_(None),
            )
        )
    else:
        # Petty cash has no organic on-site collection source: its money comes
        # from transfers received into the branch, which is its "collected".
        collected = await _one(
            select(func.coalesce(func.sum(BranchTransfer.amount), 0))
            .where(
                BranchTransfer.to_branch_id == branch_id,
                BranchTransfer.pool == TransferPool.PETTY_CASH,
                BranchTransfer.status == TransferStatus.RECEIVED,
                BranchTransfer.cancelled_at.is_(None),
            )
        )
        received = 0.0

    expenses = await _one(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.branch_id == branch_id,
            Expense.status == ExpenseStatus.PAID,
            Expense.account == pool,
        )
    )

    remitted = await _one(
        select(func.coalesce(func.sum(BranchTransfer.amount), 0))
        .where(
            BranchTransfer.from_branch_id == branch_id,
            BranchTransfer.pool == TransferPool(pool),
            BranchTransfer.status.in_([TransferStatus.INITIATED, TransferStatus.RECEIVED]),
            BranchTransfer.cancelled_at.is_(None),
        )
    )

    return round(collected + received - expenses - remitted, 2)


async def create_branch_transfer(
    db: AsyncSession,
    from_branch_id: uuid.UUID,
    to_branch_id: uuid.UUID,
    amount: Decimal,
    reason: str | None = None,
    pool: str | None = None,
    method: str | None = None,
    reference: str | None = None,
    receipt_url: str | None = None,
    consultation_id: uuid.UUID | None = None,
    payment_id: uuid.UUID | None = None,
    payment_ids: list[uuid.UUID] | None = None,
    payment_amounts: list[dict] | None = None,
    initiated_by: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> BranchTransfer:
    if from_branch_id == to_branch_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="From and to branches must be different")
    if not await _verify_branches_in_company(
        db, [from_branch_id, to_branch_id], company_id, current_user_role
    ):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Branch not found")
    if not _transfer_role_privileged(current_user_role):
        assigned = await _user_assigned_branch_ids(db, initiated_by, company_id)
        if not assigned or {from_branch_id, to_branch_id} - assigned:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail="You can only transfer money between branches you are assigned to",
            )
    if pool:
        available = await pool_available(db, from_branch_id, pool)
        if float(amount) > available:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"Amount exceeds available {TransferPool(pool).value.replace('_', ' ')} cash in this branch. Available: {available}.",
            )
    transfer = BranchTransfer(
        from_branch_id=from_branch_id,
        to_branch_id=to_branch_id,
        amount=float(amount),
        reason=reason,
        pool=TransferPool(pool) if pool else None,
        method=TransferMethod(method) if method else None,
        reference=reference,
        receipt_url=receipt_url,
        consultation_id=consultation_id,
        payment_id=payment_id,
        initiated_by=initiated_by,
    )
    db.add(transfer)
    await db.flush()

    # Link the individual client payments this remittance is composed of
    linked_ids = set()
    if payment_id is not None:
        linked_ids.add(payment_id)
    if payment_ids:
        linked_ids.update(payment_ids)
    if payment_amounts:
        linked_ids.update(pa["payment_id"] for pa in payment_amounts)
    if linked_ids and company_id is not None:
        # Validate linked payments belong to the company's branches
        pmt_result = await db.execute(
            select(Payment)
            .join(Consultation, Payment.consultation_id == Consultation.id)
            .outerjoin(Branch, Consultation.branch_id == Branch.id)
            .where(
                Payment.id.in_(linked_ids),
                or_(Consultation.branch_id.is_(None), Branch.company_id == company_id),
                Payment.cancelled_at.is_(None),
            )
        )
        valid_payments = {p.id: p for p in pmt_result.scalars().all()}
        # Already-remitted amounts per payment, so partial remittances respect the cap
        already = {
            row[0]: float(row[1] or 0)
            for row in (
                await db.execute(
                    select(
                        TransferPaymentLink.payment_id,
                        func.coalesce(func.sum(TransferPaymentLink.amount), 0),
                    ).where(TransferPaymentLink.payment_id.in_(linked_ids)).group_by(
                        TransferPaymentLink.payment_id
                    )
                )
            ).all()
        }
        for pid in linked_ids:
            if pid not in valid_payments:
                continue
            p = valid_payments[pid]
            per_amount = None
            if payment_amounts:
                match = [pa for pa in payment_amounts if pa["payment_id"] == pid]
                if match:
                    per_amount = float(match[0]["amount"])
            if per_amount is None:
                per_amount = float(p.total_paid or p.total_amount or 0)
            # Cap at the unremitted balance of this client's payment
            unremitted = per_amount  # validation handled below
            if payment_amounts:
                max_cap = float(p.total_paid or p.total_amount or 0) - already.get(pid, 0.0)
                if per_amount > max_cap + 0.001:
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Amount {per_amount} for this client exceeds the unremitted "
                            f"balance {max_cap:.2f} on their payment account"
                        ),
                    )
                unremitted = per_amount
            else:
                unremitted = float(p.total_paid or p.total_amount or 0)
            db.add(TransferPaymentLink(
                transfer_id=transfer.id,
                payment_id=p.id,
                amount=unremitted,
            ))

    await db.flush()
    await db.refresh(transfer)
    return transfer


async def _get_transfer_scoped(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None,
) -> BranchTransfer | None:
    query = select(BranchTransfer).options(
        selectinload(BranchTransfer.from_branch),
        selectinload(BranchTransfer.to_branch),
        selectinload(BranchTransfer.payment_links),
    ).where(BranchTransfer.id == transfer_id)
    if company_id is not None:
        from_branch = select(Branch.id).where(
            Branch.id == BranchTransfer.from_branch_id,
            Branch.company_id == company_id,
        )
        to_branch = select(Branch.id).where(
            Branch.id == BranchTransfer.to_branch_id,
            Branch.company_id == company_id,
        )
        query = query.where(or_(from_branch.exists(), to_branch.exists()))
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_branch_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> BranchTransfer | None:
    return await _get_transfer_scoped(db, transfer_id, company_id, current_user_role)


async def receive_branch_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    received_by: str | None = None,
    receipt_url: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> BranchTransfer | None:
    transfer = await _get_transfer_scoped(db, transfer_id, company_id, current_user_role)
    if not transfer:
        return None
    if transfer.status != TransferStatus.INITIATED:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Only initiated transfers can be received")
    if received_by and transfer.initiated_by == received_by:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail="You cannot receive a transfer you initiated. Use Cancel instead.",
        )
    if not _transfer_role_privileged(current_user_role):
        assigned = await _user_assigned_branch_ids(db, received_by, company_id)
        if transfer.to_branch_id not in assigned:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail="You can only receive money at branches you are assigned to",
            )
    transfer.status = TransferStatus.RECEIVED
    transfer.received_by = received_by
    transfer.received_at = datetime.now(timezone.utc)
    if receipt_url:
        transfer.receipt_url = receipt_url
    await db.flush()
    await db.refresh(transfer)
    return transfer


async def cancel_branch_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    cancelled_by: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> BranchTransfer | None:
    transfer = await _get_transfer_scoped(db, transfer_id, company_id, current_user_role)
    if not transfer:
        return None
    if transfer.status != TransferStatus.INITIATED:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Only initiated transfers can be cancelled")
    transfer.status = TransferStatus.CANCELLED
    transfer.cancelled_by = cancelled_by
    transfer.cancelled_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(transfer)
    return transfer


async def list_branch_transfers(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    direction: str = "all",
    status: TransferStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> tuple[list[BranchTransfer], int]:
    query = select(BranchTransfer).options(
        selectinload(BranchTransfer.from_branch),
        selectinload(BranchTransfer.to_branch),
        selectinload(BranchTransfer.payment_links),
    )
    count_query = select(func.count(BranchTransfer.id))

    effective_branch_ids = branch_ids if branch_ids else ([branch_id] if branch_id else None)
    if effective_branch_ids:
        if direction == "incoming":
            cond = BranchTransfer.to_branch_id.in_(effective_branch_ids)
        elif direction == "outgoing":
            cond = BranchTransfer.from_branch_id.in_(effective_branch_ids)
        else:
            cond = or_(
                BranchTransfer.to_branch_id.in_(effective_branch_ids),
                BranchTransfer.from_branch_id.in_(effective_branch_ids),
            )
        query = query.where(cond)
        count_query = count_query.where(cond)
    if company_id is not None:
        from_branch = select(Branch.id).where(
            Branch.id == BranchTransfer.from_branch_id,
            Branch.company_id == company_id,
        )
        to_branch = select(Branch.id).where(
            Branch.id == BranchTransfer.to_branch_id,
            Branch.company_id == company_id,
        )
        query = query.where(or_(from_branch.exists(), to_branch.exists()))
        count_query = count_query.where(or_(from_branch.exists(), to_branch.exists()))
    if status:
        query = query.where(BranchTransfer.status == status)
        count_query = count_query.where(BranchTransfer.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(BranchTransfer.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    transfers = list(result.scalars().all())

    return transfers, total


async def list_transfer_notifications(
    db: AsyncSession,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
    current_user_phone: str | None = None,
    limit: int = 20,
) -> dict:
    """Pending transfers needing attention for the user's accessible branches.

    Returns initiated transfers received by (incoming) or sent from (outgoing)
    the user's branches, newest first.
    """
    is_privileged = _transfer_role_privileged(current_user_role)
    if is_privileged:
        bq = select(Branch.id)
        if company_id is not None:
            bq = bq.where(Branch.company_id == company_id)
    else:
        bq = (
            select(UserBranchAssignment.branch_id)
            .join(Branch, UserBranchAssignment.branch_id == Branch.id)
            .where(UserBranchAssignment.user_id == current_user_phone)
        )
        if company_id is not None:
            bq = bq.where(Branch.company_id == company_id)
    accessible = [row[0] for row in (await db.execute(bq)).all()]
    if not accessible:
        return {"items": [], "total": 0, "to_receive_count": 0, "to_receive_amount": "0.00"}

    incoming = (
        select(BranchTransfer)
        .where(
            BranchTransfer.status == TransferStatus.INITIATED,
            BranchTransfer.to_branch_id.in_(accessible),
        )
        .options(
            selectinload(BranchTransfer.from_branch),
            selectinload(BranchTransfer.to_branch),
        )
        .order_by(BranchTransfer.created_at.desc())
    )
    outgoing = (
        select(BranchTransfer)
        .where(
            BranchTransfer.status == TransferStatus.INITIATED,
            BranchTransfer.from_branch_id.in_(accessible),
        )
        .options(
            selectinload(BranchTransfer.from_branch),
            selectinload(BranchTransfer.to_branch),
        )
        .order_by(BranchTransfer.created_at.desc())
    )
    inc_result = await db.execute(incoming)
    out_result = await db.execute(outgoing)
    inc_items = list(inc_result.scalars().all())[:limit]
    out_items = list(out_result.scalars().all())[:limit]

    def _to_item(t: BranchTransfer, direction: str) -> dict:
        return {
            "id": t.id,
            "from_branch_id": t.from_branch_id,
            "to_branch_id": t.to_branch_id,
            "from_branch_name": t.from_branch.name if t.from_branch else None,
            "to_branch_name": t.to_branch.name if t.to_branch else None,
            "amount": str(t.amount),
            "reason": t.reason,
            "reference": t.reference,
            "receipt_url": t.receipt_url,
            "consultation_id": t.consultation_id,
            "payment_id": t.payment_id,
            "status": t.status.value,
            "direction": direction,
            "initiated_by": t.initiated_by,
            "initiated_at": t.initiated_at,
            "created_at": t.created_at,
        }

    items = [_to_item(t, "incoming") for t in inc_items] + [
        _to_item(t, "outgoing") for t in out_items
    ]
    items.sort(key=lambda it: it["created_at"], reverse=True)

    to_receive_amount = sum(
        (float(it["amount"]) for it in items if it["direction"] == "incoming"),
        0.0,
    )
    return {
        "items": items[:limit],
        "total": len(items[:limit]),
        "to_receive_count": sum(1 for it in items if it["direction"] == "incoming"),
        "to_receive_amount": f"{to_receive_amount:.2f}",
    }


async def get_transfer_summary(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> dict:
    """Totals for outgoing/incoming transfers (initiated + received)."""
    summary = {
        "outgoing_initiated": 0.0,
        "outgoing_received": 0.0,
        "incoming_initiated": 0.0,
        "incoming_received": 0.0,
        "total_outgoing": 0.0,
        "total_incoming": 0.0,
    }
    for role in ("outgoing", "incoming"):
        base = select(
            BranchTransfer.status,
            func.coalesce(func.sum(BranchTransfer.amount), 0),
        )
        if branch_id:
            if role == "outgoing":
                base = base.where(BranchTransfer.from_branch_id == branch_id)
            else:
                base = base.where(BranchTransfer.to_branch_id == branch_id)
        elif company_id is not None:
            branch_exists = select(Branch.id).where(
                Branch.id == (
                    BranchTransfer.from_branch_id if role == "outgoing"
                    else BranchTransfer.to_branch_id
                ),
                Branch.company_id == company_id,
            )
            base = base.where(branch_exists.exists())
        result = await db.execute(base.group_by(BranchTransfer.status))
        initiated_total = 0.0
        received_total = 0.0
        for status, amount in result:
            if status == TransferStatus.INITIATED:
                initiated_total += float(amount)
            elif status == TransferStatus.RECEIVED:
                received_total += float(amount)
        summary[f"{role}_initiated"] = initiated_total
        summary[f"{role}_received"] = received_total
        summary[f"total_{role}"] = initiated_total + received_total
    return summary


# ── Finance Summary ──


async def get_collections_sheet(
    db: AsyncSession,
    period: str = "daily",
    start_date: date | None = None,
    end_date: date | None = None,
    branch_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[dict]:
    if not start_date:
        start_date = date.today()
    if not end_date:
        end_date = start_date

    query = (
        select(Collection)
        .join(Consultation, Collection.consultation_id == Consultation.id)
        .options(
            selectinload(Collection.consultation),
            selectinload(Collection.installment),
        )
    )

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    query = query.where(Collection.created_at >= start_dt, Collection.created_at <= end_dt)

    if company_id is not None:
        query = query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    if branch_id:
        query = query.where(Consultation.branch_id == branch_id)

    query = query.order_by(Collection.created_at.asc())
    result = await db.execute(query)
    collections = list(result.unique().scalars().all())

    rows = []
    for c in collections:
        consultation = c.consultation
        client_name = f"{consultation.first_name} {consultation.last_name or ''}".strip()
        created = c.created_at.date() if c.created_at else date.today()
        rows.append({
            "id": str(c.id),
            "consultation_id": str(c.consultation_id),
            "installment_id": str(c.installment_id) if c.installment_id else None,
            "client_name": client_name,
            "client_phone": consultation.phone,
            "amount_due": c.amount_due,
            "amount_collected": c.amount_collected,
            "status": c.status.value if c.status else "pending",
            "date": created.isoformat(),
            "collected_at": c.collected_at.isoformat() if c.collected_at else None,
            "notes": c.notes,
        })

    # Group by period
    grouped = {}
    for r in rows:
        d = date.fromisoformat(r["date"])
        if period == "daily":
            key = d.isoformat()
            label = d.strftime("%a %d %b %Y")
        elif period == "weekly":
            iso_year, iso_week, _ = d.isocalendar()
            key = f"{iso_year}-W{iso_week:02d}"
            monday = d - timedelta(days=d.weekday())
            label = f"Week {iso_week} ({monday.strftime('%d %b')})"
        else:
            key = d.strftime("%Y-%m")
            label = d.strftime("%B %Y")

        if key not in grouped:
            grouped[key] = {
                "period_key": key,
                "period_label": label,
                "date": d.isoformat(),
                "total_due": 0.0,
                "total_collected": 0.0,
                "count": 0,
                "items": [],
            }
        grouped[key]["total_due"] += r["amount_due"]
        grouped[key]["total_collected"] += r["amount_collected"]
        grouped[key]["count"] += 1
        grouped[key]["items"].append(r)

    sorted_keys = sorted(grouped.keys())
    return [grouped[k] for k in sorted_keys]


async def get_finance_summary(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> dict:
    summary = {}

    # Expenses by status
    exp_query = select(
        Expense.status,
        func.coalesce(func.sum(Expense.amount), 0),
        func.count(Expense.id),
    )
    if branch_id:
        exp_query = exp_query.where(Expense.branch_id == branch_id)
    if company_id is not None:
        exp_query = exp_query.join(Branch, Expense.branch_id == Branch.id).where(Branch.company_id == company_id)
    exp_query = exp_query.group_by(Expense.status)
    result = await db.execute(exp_query)
    expenses_by_status = {}
    total_expenses = 0
    for row in result:
        expenses_by_status[row.status] = {
            "amount": float(row[1]),
            "count": row[2],
        }
        total_expenses += float(row[1])
    summary["expenses"] = expenses_by_status
    summary["total_expenses"] = total_expenses

    # Borrowed money summary
    bor_query = select(
        BorrowedMoney.status,
        func.coalesce(func.sum(BorrowedMoney.amount), 0),
        func.count(BorrowedMoney.id),
    )
    if branch_id:
        bor_query = bor_query.where(BorrowedMoney.branch_id == branch_id)
    if company_id is not None:
        bor_query = bor_query.join(Branch, BorrowedMoney.branch_id == Branch.id).where(Branch.company_id == company_id)
    bor_query = bor_query.group_by(BorrowedMoney.status)
    result = await db.execute(bor_query)
    borrowed_by_status = {}
    total_borrowed = 0
    for row in result:
        borrowed_by_status[row.status] = {
            "amount": float(row[1]),
            "count": row[2],
        }
        total_borrowed += float(row[1])
    summary["borrowed"] = borrowed_by_status
    summary["total_borrowed"] = total_borrowed

    # Collections summary
    col_query = select(
        Collection.status,
        func.coalesce(func.sum(Collection.amount_due), 0),
        func.coalesce(func.sum(Collection.amount_collected), 0),
        func.count(Collection.id),
    )
    if branch_id:
        col_query = (
            col_query.join(Consultation, Collection.consultation_id == Consultation.id)
            .where(Consultation.branch_id == branch_id)
        )
    if company_id is not None:
        col_query = col_query.join(Consultation, Collection.consultation_id == Consultation.id)
        col_query = col_query.join(Branch, Consultation.branch_id == Branch.id).where(Branch.company_id == company_id)
    col_query = col_query.group_by(Collection.status)
    result = await db.execute(col_query)
    collections_by_status = {}
    total_overdue = 0
    for row in result:
        collections_by_status[row.status] = {
            "amount_due": float(row[1]),
            "amount_collected": float(row[2]),
            "count": row[3],
        }
        if row.status == CollectionStatus.PENDING:
            total_overdue += float(row[1])
    summary["collections"] = collections_by_status
    summary["total_overdue"] = total_overdue

    return summary


# ── Expense Categories ──


DEFAULT_EXPENSE_CATEGORIES = [
    {"name": "Fuel", "code": "fuel", "requires_client": False, "is_operating": True, "account": "petty_cash", "sort_order": 1},
    {"name": "Permit Payment", "code": "permit_payment", "requires_client": True, "is_operating": False, "account": "client_accounts", "sort_order": 10},
    {"name": "Learner Permit Payment", "code": "learner_permit_payment", "requires_client": True, "is_operating": False, "account": "client_accounts", "sort_order": 11},
    {"name": "Vehicle Maintenance", "code": "vehicle_maintenance", "requires_client": False, "is_operating": True, "account": "petty_cash", "sort_order": 20},
    {"name": "Salaries", "code": "salaries", "requires_client": False, "is_operating": True, "account": "petty_cash", "sort_order": 30},
    {"name": "Rent", "code": "rent", "requires_client": False, "is_operating": True, "account": "petty_cash", "sort_order": 40},
    {"name": "Utilities", "code": "utilities", "requires_client": False, "is_operating": True, "account": "petty_cash", "sort_order": 50},
]


async def seed_default_expense_categories(
    db: AsyncSession, company_id: uuid.UUID | None
) -> None:
    if company_id is None:
        return
    result = await db.execute(
        select(func.count(ExpenseCategory.id)).where(
            ExpenseCategory.company_id == company_id
        )
    )
    if (result.scalar() or 0) > 0:
        return
    for c in DEFAULT_EXPENSE_CATEGORIES:
        db.add(ExpenseCategory(company_id=company_id, **c))
    await db.flush()


async def list_expense_categories(
    db: AsyncSession,
    company_id: uuid.UUID | None = None,
    include_inactive: bool = False,
) -> list[ExpenseCategory]:
    if company_id is not None:
        await seed_default_expense_categories(db, company_id)
    query = select(ExpenseCategory)
    if company_id is not None:
        query = query.where(ExpenseCategory.company_id == company_id)
    if not include_inactive:
        query = query.where(ExpenseCategory.is_active.is_(True))
    query = query.order_by(ExpenseCategory.sort_order.asc(), ExpenseCategory.name.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_expense_category(
    db: AsyncSession,
    name: str,
    code: str,
    requires_client: bool = False,
    is_operating: bool = True,
    account: str = "petty_cash",
    sort_order: int = 0,
    is_active: bool = True,
    company_id: uuid.UUID | None = None,
) -> ExpenseCategory:
    if company_id is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Company required")
    existing = await db.execute(
        select(ExpenseCategory).where(
            ExpenseCategory.company_id == company_id,
            ExpenseCategory.code == code,
        )
    )
    if existing.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Category code already exists")
    cat = ExpenseCategory(
        company_id=company_id, name=name, code=code,
        requires_client=requires_client, is_operating=is_operating,
        account=account, sort_order=sort_order, is_active=is_active,
    )
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


async def update_expense_category(
    db: AsyncSession,
    category_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    **fields,
) -> ExpenseCategory | None:
    query = select(ExpenseCategory).where(ExpenseCategory.id == category_id)
    if company_id is not None:
        query = query.where(ExpenseCategory.company_id == company_id)
    result = await db.execute(query)
    cat = result.scalar_one_or_none()
    if not cat:
        return None
    for key, value in fields.items():
        if value is not None and hasattr(cat, key):
            setattr(cat, key, value)
    await db.flush()
    await db.refresh(cat)
    return cat


async def delete_expense_category(
    db: AsyncSession,
    category_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
) -> bool:
    query = select(ExpenseCategory).where(ExpenseCategory.id == category_id)
    if company_id is not None:
        query = query.where(ExpenseCategory.company_id == company_id)
    result = await db.execute(query)
    cat = result.scalar_one_or_none()
    if not cat:
        return False
    await db.delete(cat)
    await db.flush()
    return True


def _category_code_from_name(name: str) -> str:
    code = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "other"
    return code[:100]


async def sync_used_expense_categories(
    db: AsyncSession,
    company_id: uuid.UUID,
) -> dict:
    """Create ExpenseCategory entries for every distinct expense category that
    has already been used by an expense in this company but is not yet present
    in the catalogue. Legacy/arbitrary categories entered as free text are
    picked up here."""
    if company_id is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Company required")

    distinct_cats = (
        await db.execute(
            select(Expense.category)
            .join(Branch, Branch.id == Expense.branch_id)
            .where(
                Branch.company_id == company_id,
                Expense.category.is_not(None),
                Expense.category != "",
            )
            .distinct()
        )
    ).scalars().all()

    existing_names_lower = {
        n.lower()
        for n in (
            await db.execute(
                select(ExpenseCategory.name).where(ExpenseCategory.company_id == company_id)
            )
        ).scalars().all()
    }
    existing_codes = set(
        (
            await db.execute(
                select(ExpenseCategory.code).where(ExpenseCategory.company_id == company_id)
            )
        ).scalars().all()
    )
    existing_codes_lower = {c.lower() for c in existing_codes}

    created = 0
    current_name = ""
    max_order_result = await db.execute(
        select(func.max(ExpenseCategory.sort_order)).where(ExpenseCategory.company_id == company_id)
    )
    next_order = (max_order_result.scalar() or 0) + 1

    for current_name in distinct_cats:
        name = current_name.strip()
        if not name:
            continue
        name_lower = name.lower()
        if name_lower in ("other", "__other__"):
            continue
        if name_lower in existing_names_lower or name_lower in existing_codes_lower:
            continue
        code = _category_code_from_name(name)
        unique_code = code
        i = 2
        while unique_code in existing_codes:
            unique_code = f"{code}_{i}"
            i += 1
        db.add(ExpenseCategory(
            company_id=company_id, name=name, code=unique_code,
            requires_client=False, is_operating=True,
            account="petty_cash", sort_order=next_order, is_active=True,
        ))
        existing_names_lower.add(name.lower())
        existing_codes.add(unique_code)
        created += 1
        next_order += 1

    await db.flush()
    return {"created": created}


# ── Cash Position ──


async def _resolve_companies_branches(db, branch_ids, company_id, current_user_role):
    if branch_ids:
        return list(branch_ids)
    query = select(Branch)
    if company_id is not None:
        query = query.where(Branch.company_id == company_id)
    result = await db.execute(query)
    return [b.id for b in result.scalars().all()]


async def list_unremitted_client_payments(
    db: AsyncSession,
    branch_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None,
    search: str | None = None,
) -> list[dict]:
    """Return client payments collected at `branch_id` that still have an
    unremitted balance (not fully linked to branch transfers). Each entry
    carries the client's name/phone and the remaining unremitted amount, which
    is the cap that can be sent when remitting to head office."""
    if not branch_id:
        return []
    if not await _verify_branches_in_company(db, [branch_id], company_id, current_user_role):
        return []

    linked_sum = (
        select(
            TransferPaymentLink.payment_id,
            func.coalesce(func.sum(TransferPaymentLink.amount), 0).label("remitted"),
        )
        .group_by(TransferPaymentLink.payment_id)
        .subquery()
    )
    query = (
        select(Payment, Consultation, func.coalesce(linked_sum.c.remitted, 0))
        .join(Consultation, Payment.consultation_id == Consultation.id)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .outerjoin(linked_sum, Payment.id == linked_sum.c.payment_id)
        .where(
            Payment.branch_id == branch_id,
            Payment.cancelled_at.is_(None),
            or_(Consultation.branch_id.is_(None), Branch.company_id == company_id),
            func.coalesce(Payment.total_paid, Payment.total_amount, 0)
            > func.coalesce(linked_sum.c.remitted, 0) + 0.001,
        )
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Consultation.first_name.ilike(term),
                Consultation.last_name.ilike(term),
                Consultation.phone.ilike(term),
            )
        )

    query = query.order_by(Payment.created_at.desc())
    result = await db.execute(query)
    rows = result.all()

    items = []
    for p, c, remitted in rows:
        client_name = f"{c.first_name} {c.last_name or ''}".strip()
        remaining = float(p.total_paid or p.total_amount or 0) - float(remitted or 0)
        if remaining <= 0.001:
            continue
        items.append({
            "payment_id": str(p.id),
            "consultation_id": str(c.id),
            "client_name": client_name,
            "client_phone": c.phone,
            "amount": round(remaining, 2),
            "document_date": p.document_date.isoformat() if p.document_date else None,
        })
    return items


async def _company_head_office_id(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    any_branch_id: uuid.UUID,
) -> uuid.UUID | None:
    cid = company_id
    if cid is None:
        br = (
            await db.execute(select(Branch).where(Branch.id == any_branch_id))
        ).scalar_one_or_none()
        cid = br.company_id if br else None
    if cid is None:
        return None
    comp = (
        await db.execute(select(Company).where(Company.id == cid))
    ).scalar_one_or_none()
    return comp.head_office_branch_id if comp else None


async def ho_available_to_fund(
    db: AsyncSession,
    head_office_id: uuid.UUID,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None,
) -> list[dict]:
    """Per-client amounts of client-account money held at the head office that
    can be funded back to a branch.

    available = (client-account transfers received into head office for the
    client) - (client-account transfers already funded back out of head office).
    Only clients with a positive available amount are returned."""
    if not await _verify_branches_in_company(db, [head_office_id], company_id, current_user_role):
        return []
    links = (
        select(
            TransferPaymentLink,
            BranchTransfer.from_branch_id.label("from_branch"),
            BranchTransfer.to_branch_id.label("to_branch"),
            Payment.consultation_id.label("consultation_id"),
        )
        .join(BranchTransfer, TransferPaymentLink.transfer_id == BranchTransfer.id)
        .join(Payment, TransferPaymentLink.payment_id == Payment.id)
        .where(
            BranchTransfer.pool == TransferPool.CLIENT_ACCOUNTS,
            BranchTransfer.cancelled_at.is_(None),
        )
    )
    rows = (await db.execute(links)).all()

    net: dict[uuid.UUID, float] = {}
    for link, fb, tb, cid in rows:
        amt = float(link.amount or 0)
        if cid is None:
            continue
        if tb == head_office_id:
            net[cid] = net.get(cid, 0.0) + amt
        if fb == head_office_id:
            net[cid] = net.get(cid, 0.0) - amt

    positive = {cid: amt for cid, amt in net.items() if amt > 0}
    if not positive:
        return []
    cons = (
        select(Consultation)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .where(
            Consultation.id.in_(list(positive.keys())),
            or_(Consultation.branch_id.is_(None), Branch.company_id == company_id),
        )
    )
    cs = (await db.execute(cons)).scalars().all()
    items = []
    for c in cs:
        items.append({
            "consultation_id": str(c.id),
            "client_name": f"{c.first_name} {c.last_name or ''}".strip(),
            "client_phone": c.phone,
            "available_to_fund": round(positive.get(c.id, 0.0), 2),
        })
    items.sort(key=lambda x: x["client_name"].lower())
    return items


async def create_ho_funding(
    db: AsyncSession,
    to_branch_id: uuid.UUID,
    items: list[dict],
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None,
    initiated_by: str | None = None,
    method: str | None = None,
    reference: str | None = None,
    reason: str | None = None,
) -> BranchTransfer:
    """Fund client-account money from the head office back to a branch.

    Each selected client's amount is validated against its available-to-fund
    cap (remitted_to_ho - funded_back). A single client-account transfer is
    created from head office to the branch, with a TransferPaymentLink per
    client carrying that client's funded amount, so it never alters the
    client's outstanding balance."""
    from fastapi import HTTPException
    head_office_id = await _company_head_office_id(db, company_id, to_branch_id)
    if not head_office_id:
        raise HTTPException(status_code=400, detail="Head office branch not configured for this company")
    if to_branch_id == head_office_id:
        raise HTTPException(status_code=400, detail="Destination branch cannot be the head office")

    avail = {
        c["consultation_id"]: c["available_to_fund"]
        for c in await ho_available_to_fund(db, head_office_id, company_id, current_user_role)
    }
    total = Decimal("0")
    for it in items:
        cid = str(it.get("consultation_id") or "")
        amt = Decimal(str(it.get("amount") or 0))
        if not cid:
            raise HTTPException(status_code=400, detail="Each funding item needs a consultation_id")
        cap = avail.get(cid, 0)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Funding amounts must be greater than zero")
        if amt > Decimal(str(cap)):
            raise HTTPException(
                status_code=400,
                detail="Funding amount exceeds the available head-office balance for this client",
            )
        total += amt
    if total <= 0:
        raise HTTPException(status_code=400, detail="Select at least one client with a positive funding amount")

    transfer = await create_branch_transfer(
        db,
        from_branch_id=head_office_id,
        to_branch_id=to_branch_id,
        amount=total,
        reason=reason or "Head office client funding",
        pool=TransferPool.CLIENT_ACCOUNTS.value,
        method=method,
        reference=reference,
        initiated_by=initiated_by,
        company_id=company_id,
        current_user_role=current_user_role,
    )
    for it in items:
        cid = uuid.UUID(str(it["consultation_id"]))
        amt = Decimal(str(it["amount"]))
        pmt = (
            await db.execute(
                select(Payment)
                .where(Payment.consultation_id == cid, Payment.cancelled_at.is_(None))
                .limit(1)
            )
        ).scalar_one_or_none()
        if pmt:
            db.add(TransferPaymentLink(
                transfer_id=transfer.id,
                payment_id=pmt.id,
                amount=float(amt),
            ))
    await db.flush()
    await db.refresh(transfer)
    return transfer


async def get_cash_position(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[dict]:
    branches = await _resolve_companies_branches(db, branch_ids, company_id, current_user_role)
    if not branches:
        return []
    if branch_id:
        branches = [b for b in branches if b == branch_id]

    result = []
    for bid in branches:
        branch_row = await db.get(Branch, bid)
        name = branch_row.name if branch_row else "Unknown"

        # Collected client payments at this collecting branch -> Client Accounts
        collected = await db.execute(
            select(func.coalesce(func.sum(Payment.total_paid), 0))
            .where(Payment.branch_id == bid, Payment.cancelled_at.is_(None))
        )
        client_collected = float(collected.scalar() or 0)

        # Petty cash collected = transfers RECEIVED into this branch with pool=petty_cash
        petty_inflow = await db.execute(
            select(func.coalesce(func.sum(BranchTransfer.amount), 0))
            .where(
                BranchTransfer.to_branch_id == bid,
                BranchTransfer.pool == TransferPool.PETTY_CASH,
                BranchTransfer.status == TransferStatus.RECEIVED,
            )
        )
        petty_collected = float(petty_inflow.scalar() or 0)

        # Remitted (received) transfers sent FROM this branch, by pool
        remit_rows = await db.execute(
            select(
                BranchTransfer.pool,
                func.coalesce(func.sum(BranchTransfer.amount), 0),
            )
            .where(
                BranchTransfer.from_branch_id == bid,
                BranchTransfer.status == TransferStatus.RECEIVED,
            )
            .group_by(BranchTransfer.pool)
        )
        remitted = {
            "petty_cash": 0.0,
            "client_accounts": 0.0,
        }
        for p, amt in remit_rows:
            remitted[p.value if p else "petty_cash"] = float(amt)

        pending_remit_rows = await db.execute(
            select(
                BranchTransfer.pool,
                func.coalesce(func.sum(BranchTransfer.amount), 0),
            )
            .where(
                BranchTransfer.from_branch_id == bid,
                BranchTransfer.status == TransferStatus.INITIATED,
            )
            .group_by(BranchTransfer.pool)
        )
        pending_remitted = {
            "petty_cash": 0.0,
            "client_accounts": 0.0,
        }
        for p, amt in pending_remit_rows:
            pending_remitted[p.value if p else "petty_cash"] = float(amt)

        # Transfers RECEIVED into this branch, by pool -> "Received"
        received_rows = await db.execute(
            select(
                BranchTransfer.pool,
                func.coalesce(func.sum(BranchTransfer.amount), 0),
            )
            .where(
                BranchTransfer.to_branch_id == bid,
                BranchTransfer.status == TransferStatus.RECEIVED,
                BranchTransfer.cancelled_at.is_(None),
            )
            .group_by(BranchTransfer.pool)
        )
        received_by_pool = {"petty_cash": 0.0, "client_accounts": 0.0}
        for p, amt in received_rows:
            key = (p.value if p else "petty_cash")
            if key == "petty_cash":
                # Petty inflows are already counted as Petty Cash "collected".
                received_by_pool["petty_cash"] = 0.0
            else:
                received_by_pool["client_accounts"] = float(amt)

        # Paid expenses at this branch, attributed to their pool via expense.account
        exp_rows = await db.execute(
            select(
                Expense.account,
                func.coalesce(func.sum(Expense.amount), 0),
            )
            .where(Expense.branch_id == bid, Expense.status == ExpenseStatus.PAID)
            .group_by(Expense.account)
        )
        expenses_petty = 0.0
        expenses_client = 0.0
        for account, amt in exp_rows:
            if account == "client_accounts":
                expenses_client += float(amt)
            else:
                expenses_petty += float(amt)

        group_sub = (
            select(
                func.greatest(
                    func.max(Payment.total_amount) - func.sum(Payment.total_paid), 0
                ).label("balance")
            )
            .join(Consultation, Payment.consultation_id == Consultation.id)
            .where(
                Consultation.branch_id == bid,
                Payment.cancelled_at.is_(None),
            )
            .group_by(Payment.consultation_id, Payment.product_id, Payment.package_id)
            .subquery()
        )
        outstanding_total = float(
            (
                await db.execute(
                    select(func.coalesce(func.sum(group_sub.c.balance), 0))
                )
            ).scalar()
            or 0
        )

        def _net(collect, receive, rem, pend, exp):
            return round(collect + receive - rem - pend - exp, 2)

        pools = [
            {
                "pool": "petty_cash",
                "collected": petty_collected,
                "received": received_by_pool["petty_cash"],
                "remitted": remitted["petty_cash"],
                "pending_remitted": pending_remitted["petty_cash"],
                "expenses": expenses_petty,
                "net_in_hand": _net(petty_collected, received_by_pool["petty_cash"], remitted["petty_cash"], pending_remitted["petty_cash"], expenses_petty),
            },
            {
                "pool": "client_accounts",
                "collected": client_collected,
                "received": received_by_pool["client_accounts"],
                "remitted": remitted["client_accounts"],
                "pending_remitted": pending_remitted["client_accounts"],
                "expenses": expenses_client,
                "net_in_hand": _net(client_collected, received_by_pool["client_accounts"], remitted["client_accounts"], pending_remitted["client_accounts"], expenses_client),
                "outstanding": outstanding_total,
            },
        ]
        result.append({
            "branch_id": str(bid),
            "branch_name": name,
            "pools": pools,
        })
    return result


# ── Profit & Loss ──


async def get_profit_loss(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    branch_ids: list[uuid.UUID] | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> dict:
    branches = await _resolve_companies_branches(db, branch_ids, company_id, current_user_role)
    if branch_id:
        branches = [b for b in branches if b == branch_id]

    start_dt = datetime.combine(from_date, datetime.min.time()) if from_date else None
    end_dt = datetime.combine(to_date, datetime.max.time()) if to_date else None

    revenue_q = select(
        Payment.branch_id,
        func.coalesce(func.sum(Payment.total_paid), 0),
        func.count(Payment.id),
    ).where(Payment.cancelled_at.is_(None))
    if start_dt:
        revenue_q = revenue_q.where(Payment.created_at >= start_dt)
    if end_dt:
        revenue_q = revenue_q.where(Payment.created_at <= end_dt)
    revenue_rows = (await db.execute(revenue_q.group_by(Payment.branch_id))).all()

    expenses_q = select(
        Expense.branch_id,
        func.coalesce(func.sum(Expense.amount), 0),
    ).where(Expense.status == ExpenseStatus.PAID)
    if start_dt:
        expenses_q = expenses_q.where(Expense.expense_date >= start_dt)
    if end_dt:
        expenses_q = expenses_q.where(Expense.expense_date <= end_dt)
    expense_rows = (await db.execute(expenses_q.group_by(Expense.branch_id))).all()

    from app.models.commission import Commission, CommissionStatus
    from app.models.cart import CartItem
    commissions_q = (
        select(
            Consultation.branch_id,
            func.coalesce(func.sum(Commission.total_amount), 0),
        )
        .join(CartItem, Commission.cart_item_id == CartItem.id)
        .join(Consultation, CartItem.consultation_id == Consultation.id)
        .where(Commission.status.in_([CommissionStatus.PENDING, CommissionStatus.PARTIALLY_MATURED, CommissionStatus.FULLY_MATURED]))
    )
    if start_dt:
        commissions_q = commissions_q.where(Commission.created_at >= start_dt)
    if end_dt:
        commissions_q = commissions_q.where(Commission.created_at <= end_dt)
    commission_rows = (await db.execute(commissions_q.group_by(Consultation.branch_id))).all()

    revenue_map = {r[0]: (float(r[1]), r[2]) for r in revenue_rows}
    expense_map = {r[0]: float(r[1]) for r in expense_rows}
    commission_map = {r[0]: float(r[1]) for r in commission_rows}

    items = []
    for bid in branches:
        branch_row = await db.get(Branch, bid)
        rev, count = revenue_map.get(bid, (0.0, 0))
        exp = expense_map.get(bid, 0.0)
        comm = commission_map.get(bid, 0.0)
        items.append({
            "branch_id": str(bid),
            "branch_name": branch_row.name if branch_row else "Unknown",
            "revenue": rev,
            "expenses": exp,
            "commissions": comm,
            "net": rev - exp - comm,
            "payment_count": count,
        })

    items.sort(key=lambda i: i["branch_id"])
    return {
        "items": items,
        "total_revenue": sum(i["revenue"] for i in items),
        "total_expenses": sum(i["expenses"] for i in items),
        "total_commissions": sum(i["commissions"] for i in items),
        "total_net": sum(i["net"] for i in items),
    }
