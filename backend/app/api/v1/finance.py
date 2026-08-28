import logging
import os
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.config import settings
from app.core.database import get_db
from app.models.company import BorrowStatus, CollectionStatus, ExpenseStatus, TransferStatus
from app.models.user import User
from app.schemas.company import (
    BorrowedMoneyCreate,
    BorrowedMoneyRead,
    BorrowedMoneyUpdate,
    BranchTransferCreate,
    BranchTransferRead,
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    ExpenseCategoryCreate,
    ExpenseCategoryRead,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
)
from app.services import finance as finance_service
from app.services.permission import has_permission
from app.utils.tenant import resolve_branch_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance", tags=["finance"])


def _expense_read(e) -> ExpenseRead:
    read = ExpenseRead.model_validate(e)
    client_name = None
    if e.consultation:
        c = e.consultation
        client_name = f"{c.first_name} {c.last_name or ''}".strip()
    return read.model_copy(update={
        "created_by_name": e.created_by_user.name if e.created_by_user else None,
        "approved_by_name": e.approved_by_user.name if e.approved_by_user else None,
        "paid_by_name": e.paid_by_user.name if e.paid_by_user else None,
        "client_name": client_name,
    })


async def _transfer_read(db: AsyncSession, t) -> BranchTransferRead:
    from sqlalchemy import select
    from app.models.payment import Payment
    from app.models.consultation import Consultation
    read = BranchTransferRead.model_validate(t)
    from_name = t.from_branch.name if t.from_branch else None
    to_name = t.to_branch.name if t.to_branch else None
    init_name = None
    if t.initiated_by:
        u = (await db.execute(select(User).where(User.phone == t.initiated_by))).scalar_one_or_none()
        init_name = u.name if u else None
    links = []
    if t.payment_links:
        pmt_ids = [link.payment_id for link in t.payment_links]
        amt_map = {link.payment_id: float(link.amount) for link in t.payment_links}
        pmt_rows = None
        if pmt_ids:
            pmt_rows = (await db.execute(
                select(Payment, Consultation)
                .join(Consultation, Payment.consultation_id == Consultation.id)
                .where(Payment.id.in_(pmt_ids))
            )).all()
        pmt_by_id = {}
        if pmt_rows:
            for p, c in pmt_rows:
                pmt_by_id[p.id] = c
        for link in t.payment_links:
            c = pmt_by_id.get(link.payment_id)
            links.append({
                "payment_id": link.payment_id,
                "amount": amt_map.get(link.payment_id, 0.0),
                "client_name": f"{c.first_name} {c.last_name or ''}".strip() if c else None,
                "client_phone": c.phone if c else None,
            })
    return read.model_copy(update={
        "from_branch_name": from_name,
        "to_branch_name": to_name,
        "initiated_by_name": init_name,
        "payment_links": links,
    })


@router.post("/expenses/upload-receipt")
async def upload_expense_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission("expenses.edit")),
):
    allowed_types = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    max_size = 10 * 1024 * 1024  # 10MB
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "receipts")
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "receipt.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(upload_dir, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {"url": f"/uploads/receipts/{filename}"}


# ── Expenses ──


@router.get("/expenses", response_model=dict)
async def list_expenses(
    branch_id: uuid.UUID | None = Query(None),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    status: ExpenseStatus | None = Query(None),
    category: str | None = Query(None),
    category_not: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = (
        [branch_id] if branch_id else await resolve_branch_ids(db, current_user, requested)
    )
    expenses, total = await finance_service.list_expenses(
        db, branch_ids=resolved_branch_ids, status=status,
        page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
        category=category, category_not=category_not,
    )

    items = []
    for e in expenses:
        items.append(_expense_read(e))

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.create")),
):
    expense = await finance_service.create_expense(
        db,
        branch_id=data.branch_id,
        amount=data.amount,
        description=data.description,
        category=data.category,
        consultation_id=data.consultation_id,
        mileage=data.mileage,
        vehicle_id=data.vehicle_id,
        expense_date=data.expense_date,
        status=data.status or "pending",
        created_by_phone=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    expense = await finance_service.get_expense(
        db, expense.id, company_id=current_user.company_id, current_user_role=current_user.role
    )
    return _expense_read(expense)


@router.patch("/expenses/{expense_id}", response_model=ExpenseRead)
async def update_expense(
    expense_id: uuid.UUID,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.edit")),
):
    if data.status is not None and data.status != "pending" and not await has_permission(
        db, current_user, "expenses.manage"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Status changes require expenses.manage; use the approve/reject/mark-paid actions",
        )
    expense = await finance_service.update_expense(
        db,
        expense_id=expense_id,
        status=data.status,
        approved_by=data.approved_by or current_user.phone,
        approved_at=data.approved_at,
        paid_by=data.paid_by or (current_user.phone if data.status == "paid" else None),
        paid_at=data.paid_at,
        rejection_reason=data.rejection_reason,
        receipt_url=data.receipt_url,
        consultation_id=data.consultation_id,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found",
        )

    # Send expense approved SMS to the expense creator
    if data.status == "approved" and current_user.company_id and expense.created_by_phone:
        try:
            from app.services.notification.service import on_expense_approved
            creator_result = await db.execute(
                select(User).where(User.phone == expense.created_by_phone)
            )
            creator = creator_result.scalar_one_or_none()
            if creator and creator.phone:
                creator_name = creator.name or "Staff"
                await on_expense_approved(
                    db, current_user.company_id, creator.phone, creator_name,
                    expense.description or "Expense", str(expense.amount),
                )
        except Exception as e:
            logger.warning("[SMS] Failed to send expense_approved notification: %s", e)

    return _expense_read(expense)


class ExpenseReject(BaseModel):
    rejection_reason: str


@router.post("/expenses/{expense_id}/approve", response_model=ExpenseRead)
async def approve_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.approve")),
):
    expense = await finance_service.get_expense(
        db, expense_id, company_id=current_user.company_id, current_user_role=current_user.role
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if expense.status == ExpenseStatus.PAID:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Paid expenses cannot be approved")
    if expense.status == ExpenseStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Expense already approved")
    if expense.status == ExpenseStatus.REJECTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Rejected expenses must be re-submitted as a new expense")
    if expense.created_by_phone and expense.created_by_phone == current_user.phone:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot approve your own expense")

    expense.status = ExpenseStatus.APPROVED
    expense.approved_by = current_user.phone
    expense.approved_at = datetime.now()
    expense.rejection_reason = None
    await db.flush()
    await db.refresh(expense)

    if current_user.company_id and expense.created_by_phone:
        try:
            from app.services.notification.service import on_expense_approved
            creator_result = await db.execute(
                select(User).where(User.phone == expense.created_by_phone)
            )
            creator = creator_result.scalar_one_or_none()
            if creator and creator.phone:
                await on_expense_approved(
                    db, current_user.company_id, creator.phone, creator.name or "Staff",
                    expense.description or "Expense", str(expense.amount),
                )
        except Exception as e:
            logger.warning("[SMS] Failed to send expense_approved notification: %s", e)

    return _expense_read(expense)


@router.post("/expenses/{expense_id}/reject", response_model=ExpenseRead)
async def reject_expense(
    expense_id: uuid.UUID,
    data: ExpenseReject,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.reject")),
):
    expense = await finance_service.get_expense(
        db, expense_id, company_id=current_user.company_id, current_user_role=current_user.role
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if expense.status != ExpenseStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending expenses can be rejected")
    if expense.created_by_phone and expense.created_by_phone == current_user.phone:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot reject your own expense")

    expense.status = ExpenseStatus.REJECTED
    expense.rejection_reason = data.rejection_reason
    expense.approved_by = current_user.phone
    expense.approved_at = datetime.now()
    await db.flush()
    await db.refresh(expense)
    return _expense_read(expense)


@router.post("/expenses/{expense_id}/mark-paid", response_model=ExpenseRead)
async def mark_expense_paid(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.pay")),
):
    expense = await finance_service.get_expense(
        db, expense_id, company_id=current_user.company_id, current_user_role=current_user.role
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if expense.status != ExpenseStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only approved expenses can be marked as paid")

    expense.status = ExpenseStatus.PAID
    expense.paid_by = current_user.phone
    expense.paid_at = datetime.now()
    await db.flush()
    await db.refresh(expense)
    return _expense_read(expense)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.delete")),
):
    expense = await finance_service.get_expense(
        db, expense_id, company_id=current_user.company_id, current_user_role=current_user.role
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if expense.status in (ExpenseStatus.APPROVED, ExpenseStatus.PAID):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved or paid expenses cannot be deleted")
    if expense.status == ExpenseStatus.REJECTED and not await has_permission(db, current_user, "expenses.manage"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: rejected expenses require expenses.manage to delete",
        )
    await db.delete(expense)
    await db.flush()
    return None


# ── Borrowed Money ──


@router.get("/borrowed", response_model=dict)
async def list_borrowed(
    branch_id: uuid.UUID | None = Query(None),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    status: BorrowStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = (
        [branch_id] if branch_id else await resolve_branch_ids(db, current_user, requested)
    )
    items, total = await finance_service.list_borrowed(
        db, branch_ids=resolved_branch_ids, status=status, page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return {
        "items": [BorrowedMoneyRead.model_validate(i) for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/borrowed", response_model=BorrowedMoneyRead, status_code=status.HTTP_201_CREATED)
async def create_borrowed(
    data: BorrowedMoneyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.create")),
):
    item = await finance_service.create_borrowed(
        db,
        branch_id=data.branch_id,
        direction=data.direction,
        amount=data.amount,
        interest_rate=data.interest_rate,
        description=data.description,
        lender_name=data.lender_name,
        borrower_name=data.borrower_name,
        due_date=data.due_date,
        created_by_phone=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return BorrowedMoneyRead.model_validate(item)


@router.patch("/borrowed/{item_id}", response_model=BorrowedMoneyRead)
async def update_borrowed(
    item_id: uuid.UUID,
    data: BorrowedMoneyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.edit")),
):
    item = await finance_service.update_borrowed(
        db,
        item_id=item_id,
        direction=data.direction,
        amount=data.amount,
        interest_rate=data.interest_rate,
        description=data.description,
        lender_name=data.lender_name,
        borrower_name=data.borrower_name,
        due_date=data.due_date,
        status=data.status,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Borrowed money record not found",
        )
    return BorrowedMoneyRead.model_validate(item)


# ── Collections ──


@router.get("/collections", response_model=dict)
async def list_collections(
    branch_id: uuid.UUID | None = Query(None),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    status: CollectionStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = (
        [branch_id] if branch_id else await resolve_branch_ids(db, current_user, requested)
    )
    collections, total = await finance_service.list_collections(
        db, branch_ids=resolved_branch_ids, status=status, page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return {
        "items": [CollectionRead.model_validate(c) for c in collections],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/collections", response_model=CollectionRead, status_code=status.HTTP_201_CREATED)
async def create_collection_for_installment(
    data: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.create")),
):
    if data.installment_id:
        collection = await finance_service.create_collection_for_installment(
            db, installment_id=data.installment_id,
            company_id=current_user.company_id, current_user_role=current_user.role,
        )
        if not collection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Installment not found",
            )
    else:
        collection = await finance_service.create_collection(
            db,
            installment_id=data.installment_id,
            consultation_id=data.consultation_id,
            amount_due=data.amount_due,
            amount_collected=data.amount_collected,
            notes=data.notes,
            company_id=current_user.company_id, current_user_role=current_user.role,
        )
    return CollectionRead.model_validate(collection)


@router.patch("/collections/{collection_id}", response_model=CollectionRead)
async def update_collection(
    collection_id: uuid.UUID,
    data: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.edit")),
):
    collection = await finance_service.update_collection(
        db,
        collection_id=collection_id,
        amount_collected=data.amount_collected,
        status=data.status,
        notes=data.notes,
        collected_by=data.collected_by or current_user.phone,
        collected_at=data.collected_at,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection record not found",
        )
    return CollectionRead.model_validate(collection)


# ── Dunning ──


@router.get("/dunning", response_model=list[dict])
async def get_dunning_list(
    branch_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.view")),
):
    return await finance_service.get_dunning_list(db, branch_id=branch_id, company_id=current_user.company_id, current_user_role=current_user.role)


@router.post("/dunning/send", response_model=dict)
async def send_dunning(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.send_dunning")),
):
    sent_count = await finance_service.send_dunning_notifications(db)
    return {"sent": sent_count, "message": f"Dunning notices sent to {sent_count} clients"}


# ── Branch Transfers ──


@router.get("/transfers", response_model=dict)
async def list_branch_transfers(
    branch_id: uuid.UUID | None = Query(None),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    direction: str = Query("all", pattern="^(all|incoming|outgoing)$"),
    status: TransferStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("transfers.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = (
        [branch_id] if branch_id else await resolve_branch_ids(db, current_user, requested)
    )
    transfers, total = await finance_service.list_branch_transfers(
        db, branch_ids=resolved_branch_ids, direction=direction, status=status,
        page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    items = []
    for t in transfers:
        items.append(await _transfer_read(db, t))
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/transfers/notifications", response_model=dict)
async def list_transfer_notifications(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("transfers.view")),
):
    return await finance_service.list_transfer_notifications(
        db,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
        current_user_phone=current_user.phone,
        limit=limit,
    )


@router.post("/transfers", response_model=BranchTransferRead, status_code=status.HTTP_201_CREATED)
async def create_branch_transfer(
    data: BranchTransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("transfers.create")),
):
    transfer = await finance_service.create_branch_transfer(
        db,
        from_branch_id=data.from_branch_id,
        to_branch_id=data.to_branch_id,
        amount=data.amount,
        reason=data.reason,
        pool=data.pool,
        method=data.method,
        reference=data.reference,
        consultation_id=data.consultation_id,
        payment_id=data.payment_id,
        payment_ids=data.payment_ids,
        initiated_by=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    transfer = await finance_service.get_branch_transfer(
        db, transfer.id,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return await _transfer_read(db, transfer)


@router.post("/transfers/{transfer_id}/receive", response_model=BranchTransferRead)
async def receive_branch_transfer(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("transfers.receive")),
):
    transfer = await finance_service.receive_branch_transfer(
        db, transfer_id, received_by=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transfer not found",
        )
    return await _transfer_read(db, transfer)


@router.post("/transfers/{transfer_id}/cancel", response_model=BranchTransferRead)
async def cancel_branch_transfer(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("transfers.cancel")),
):
    transfer = await finance_service.cancel_branch_transfer(
        db, transfer_id, cancelled_by=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transfer not found",
        )
    return await _transfer_read(db, transfer)


@router.get("/transfers/summary", response_model=dict)
async def get_transfer_summary(
    branch_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("transfers.view")),
):
    return await finance_service.get_transfer_summary(
        db, branch_id=branch_id,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )


# ── Finance Summary ──


@router.get("/collections/sheet", response_model=list[dict])
async def get_collections_sheet(
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.view")),
):
    return await finance_service.get_collections_sheet(
        db, period=period, start_date=start_date, end_date=end_date,
        branch_id=branch_id,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )


@router.get("/summary", response_model=dict)
async def get_finance_summary(
    branch_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("collections.view")),
):
    return await finance_service.get_finance_summary(db, branch_id=branch_id, company_id=current_user.company_id, current_user_role=current_user.role)


# ── Expense Categories ──


@router.get("/expense-categories", response_model=dict)
async def list_expense_categories(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.view")),
):
    cats = await finance_service.list_expense_categories(
        db, company_id=current_user.company_id, include_inactive=include_inactive
    )
    return {"items": [ExpenseCategoryRead.model_validate(c) for c in cats]}


@router.post("/expense-categories", response_model=ExpenseCategoryRead, status_code=status.HTTP_201_CREATED)
async def create_expense_category(
    data: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    return ExpenseCategoryRead.model_validate(await finance_service.create_expense_category(
        db, name=data.name, code=data.code, requires_client=data.requires_client,
        is_operating=data.is_operating, sort_order=data.sort_order,
        is_active=data.is_active, company_id=current_user.company_id,
    ))


@router.patch("/expense-categories/{category_id}", response_model=ExpenseCategoryRead)
async def update_expense_category(
    category_id: uuid.UUID,
    data: ExpenseCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    cat = await finance_service.update_expense_category(
        db, category_id, company_id=current_user.company_id,
        name=data.name, code=data.code, requires_client=data.requires_client,
        is_operating=data.is_operating, sort_order=data.sort_order, is_active=data.is_active,
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return ExpenseCategoryRead.model_validate(cat)


@router.delete("/expense-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    deleted = await finance_service.delete_expense_category(
        db, category_id, company_id=current_user.company_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Category not found")
    return None


# ── Cash Position ──


@router.get("/cash-position", response_model=list[dict])
async def get_cash_position(
    branch_id: uuid.UUID | None = Query(None),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = (
        [branch_id] if branch_id else await resolve_branch_ids(db, current_user, requested)
    )
    return await finance_service.get_cash_position(
        db, branch_ids=resolved_branch_ids,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )


# ── Profit & Loss ──


@router.get("/profit-loss", response_model=dict)
async def get_profit_loss(
    branch_id: uuid.UUID | None = Query(None),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view")),
):
    requested = (
        [uuid.UUID(b) for b in branch_ids.split(",") if b]
        if branch_ids
        else None
    )
    resolved_branch_ids = (
        [branch_id] if branch_id else await resolve_branch_ids(db, current_user, requested)
    )
    return await finance_service.get_profit_loss(
        db, branch_ids=resolved_branch_ids, from_date=from_date, to_date=to_date,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
