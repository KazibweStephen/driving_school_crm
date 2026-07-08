import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import (
    BorrowedMoney,
    BorrowStatus,
    Collection,
    CollectionStatus,
    Expense,
    ExpenseStatus,
)
from app.models.consultation import Consultation
from app.models.payment import Installment, InstallmentStatus
from app.services.notification import send_dunning_notice, send_expense_approved


# ── Expenses ──


async def list_expenses(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    status: ExpenseStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Expense], int]:
    query = select(Expense)
    count_query = select(func.count(Expense.id))

    if branch_id:
        query = query.where(Expense.branch_id == branch_id)
        count_query = count_query.where(Expense.branch_id == branch_id)
    if status:
        query = query.where(Expense.status == status)
        count_query = count_query.where(Expense.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Expense.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    expenses = list(result.scalars().all())

    return expenses, total


async def create_expense(
    db: AsyncSession,
    branch_id: uuid.UUID,
    amount: float,
    description: str | None = None,
    category: str | None = None,
    mileage: int | None = None,
    vehicle_id: uuid.UUID | None = None,
    expense_date: datetime | None = None,
    status: str = "pending",
    created_by_phone: str | None = None,
) -> Expense:
    expense = Expense(
        branch_id=branch_id,
        amount=amount,
        description=description,
        category=category,
        mileage=mileage,
        vehicle_id=vehicle_id,
        expense_date=expense_date or datetime.now(timezone.utc),
        status=ExpenseStatus(status),
        created_by_phone=created_by_phone,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense)
    return expense


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
) -> Expense | None:
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
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

    await db.flush()
    await db.refresh(expense)
    return expense


# ── Borrowed Money ──


async def list_borrowed(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
    status: BorrowStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BorrowedMoney], int]:
    query = select(BorrowedMoney)
    count_query = select(func.count(BorrowedMoney.id))

    if branch_id:
        query = query.where(BorrowedMoney.branch_id == branch_id)
        count_query = count_query.where(BorrowedMoney.branch_id == branch_id)
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
) -> BorrowedMoney:
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
) -> BorrowedMoney | None:
    result = await db.execute(select(BorrowedMoney).where(BorrowedMoney.id == item_id))
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
    status: CollectionStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Collection], int]:
    query = select(Collection).options(
        selectinload(Collection.installment),
        selectinload(Collection.consultation),
    )
    count_query = select(func.count(Collection.id))

    if branch_id:
        query = (
            query.join(Consultation, Collection.consultation_id == Consultation.id)
            .where(Consultation.branch_id == branch_id)
        )
        count_query = (
            count_query.join(Consultation, Collection.consultation_id == Consultation.id)
            .where(Consultation.branch_id == branch_id)
        )
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
) -> Collection:
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
) -> Collection | None:
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
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
) -> Collection | None:
    result = await db.execute(
        select(Installment)
        .options(selectinload(Installment.payment).selectinload(Payment.consultation))
        .where(Installment.id == installment_id)
    )
    installment = result.scalar_one_or_none()
    if not installment:
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
        ok = await send_dunning_notice(
            phone=consultation.phone,
            client_name=consultation.first_name,
            overdue_amount=str(inst.amount),
            days_overdue=days_overdue,
            total_balance=str(inst.payment.balance),
        )
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


# ── Finance Summary ──


async def get_finance_summary(
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
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
