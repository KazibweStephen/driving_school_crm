import logging
import os
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.company import BorrowStatus, CollectionStatus, ExpenseStatus
from app.models.user import User
from app.schemas.company import (
    BorrowedMoneyCreate,
    BorrowedMoneyRead,
    BorrowedMoneyUpdate,
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
)
from app.services import finance as finance_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance", tags=["finance"])


@router.post("/expenses/upload-receipt")
async def upload_expense_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
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
    status: ExpenseStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expenses, total = await finance_service.list_expenses(
        db, branch_id=branch_id, status=status, page=page, page_size=page_size,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return {
        "items": [ExpenseRead.model_validate(e) for e in expenses],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = await finance_service.create_expense(
        db,
        branch_id=data.branch_id,
        amount=data.amount,
        description=data.description,
        category=data.category,
        mileage=data.mileage,
        vehicle_id=data.vehicle_id,
        expense_date=data.expense_date,
        status=data.status or "pending",
        created_by_phone=current_user.phone,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return ExpenseRead.model_validate(expense)


@router.patch("/expenses/{expense_id}", response_model=ExpenseRead)
async def update_expense(
    expense_id: uuid.UUID,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    return ExpenseRead.model_validate(expense)


# ── Borrowed Money ──


@router.get("/borrowed", response_model=dict)
async def list_borrowed(
    branch_id: uuid.UUID | None = Query(None),
    status: BorrowStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await finance_service.list_borrowed(
        db, branch_id=branch_id, status=status, page=page, page_size=page_size,
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    status: CollectionStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collections, total = await finance_service.list_collections(
        db, branch_id=branch_id, status=status, page=page, page_size=page_size,
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    return await finance_service.get_dunning_list(db, branch_id=branch_id, company_id=current_user.company_id, current_user_role=current_user.role)


@router.post("/dunning/send", response_model=dict)
async def send_dunning(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sent_count = await finance_service.send_dunning_notifications(db)
    return {"sent": sent_count, "message": f"Dunning notices sent to {sent_count} clients"}


# ── Finance Summary ──


@router.get("/collections/sheet", response_model=list[dict])
async def get_collections_sheet(
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    return await finance_service.get_finance_summary(db, branch_id=branch_id, company_id=current_user.company_id, current_user_role=current_user.role)
