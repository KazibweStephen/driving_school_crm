import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.user import User
from app.schemas.permit import (
    PermitProgressRead,
    PermitTrackerListResponse,
    PermitTrackerRead,
    PermitProgressUpdate,
    EligibilityOverrideCreate,
    PermitAuditLogRead,
    PermitExpenseRecordCreate,
)
from app.services import permit as permit_service
from app.services.permit import categorize_permit_expense, apply_permit_expense_effects

# ── Cart-item-scoped endpoints (existing) ────────────────────────────

router = APIRouter(prefix="/cart-items", tags=["permit"])


@router.get("/{cart_item_id}/permit-progress", response_model=PermitProgressRead | None)
async def get_permit_progress(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("training.view")),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    progress = await permit_service.get_permit_progress(db, cid, company_id=current_user.company_id, current_user_role=current_user.role)
    if progress is None:
        return None
    return PermitProgressRead.model_validate(progress)


@router.patch("/{cart_item_id}/permit-progress", response_model=PermitProgressRead)
async def update_permit_progress(
    cart_item_id: str,
    data: PermitProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("training.edit")),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    progress = await permit_service.upsert_permit_progress(
        db, cid,
        start_date=data.start_date,
        got_learners_permit_date=data.got_learners_permit_date,
        learners_due_date=data.learners_due_date,
        learners_expiry_date=data.learners_expiry_date,
        learners_permit_photo_url=data.learners_permit_photo_url,
        test_ready=data.test_ready,
        waiting_for_permit=data.waiting_for_permit,
        permit_paid=data.permit_paid,
        permit_received_date=data.permit_received_date,
        tested_on_date=data.tested_on_date,
        test_date=data.test_date,
        expecting_permit_on_date=data.expecting_permit_on_date,
        delayed_days=data.delayed_days,
        notes=data.notes,
        company_id=current_user.company_id, current_user_role=current_user.role,
        changed_by=current_user.phone,
        changed_by_name=(current_user.first_name or "") + " " + (current_user.last_name or ""),
    )
    return PermitProgressRead.model_validate(progress)


@router.post("/{cart_item_id}/permit-progress/override-eligibility", response_model=PermitProgressRead)
async def override_eligibility(
    cart_item_id: str,
    data: EligibilityOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("training.edit")),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    progress = await permit_service.override_eligibility(
        db, cid, data.eligible, data.reason,
        current_user, company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return PermitProgressRead.model_validate(progress)


@router.get("/{cart_item_id}/permit-progress/audit", response_model=list[PermitAuditLogRead])
async def get_audit_logs(
    cart_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("training.view")),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    logs = await permit_service.list_audit_logs(
        db, cid, company_id=current_user.company_id, user_role=current_user.role
    )
    return [PermitAuditLogRead.model_validate(l) for l in logs]


@router.post("/{cart_item_id}/permit-progress/record-expense", response_model=PermitProgressRead)
async def record_permit_expense(
    cart_item_id: str,
    data: PermitExpenseRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.create")),
):
    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    progress = await permit_service.record_permit_expense(
        db, cid,
        expense_items=[e.model_dump() for e in data.expenses],
        expense_date=data.expense_date,
        current_user=current_user,
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return PermitProgressRead.model_validate(progress)


# ── Permit-tracker list endpoint ────────────────────────────────────

permit_router = APIRouter(prefix="/permits", tags=["permit"])


@permit_router.get("/", response_model=PermitTrackerListResponse)
async def list_permit_trackers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("training.view")),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    search: str | None = None,
    status: str | None = Query(None, pattern="^(eligible|not_qualified|learners_active|due_for_testing|test_ready|waiting_for_permit|permit_paid|permit_received|learner_pending_approval|learner_pending_payment|test_pending_approval|test_pending_payment|permit_pending_approval|permit_pending_payment)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    parsed_branch_ids = None
    if branch_ids:
        parsed_branch_ids = [uuid.UUID(b) for b in branch_ids.split(",") if b.strip()]
    trackers, total = await permit_service.list_permit_trackers(
        db, current_user.company_id, current_user.role,
        branch_ids=parsed_branch_ids, search=search, status=status,
        page=page, page_size=page_size,
    )
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    return PermitTrackerListResponse(
        trackers=[PermitTrackerRead.model_validate(t) for t in trackers],
        total=total, page=page, page_size=page_size, total_pages=total_pages,
    )


@permit_router.post("/{cart_item_id}/photo", response_model=PermitProgressRead)
async def upload_permit_photo(
    cart_item_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("training.edit")),
):
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".gif"}
    allowed_types = {
        "image/jpeg", "image/jpg", "image/png", "image/webp",
        "image/heic", "image/heif", "image/bmp", "image/gif", "application/octet-stream",
    }
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    ct = (file.content_type or "").lower()
    if ct and ct not in allowed_types and ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type or ext}")
    if not ct and ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    max_size = 5 * 1024 * 1024  # 5MB
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    try:
        cid = uuid.UUID(cart_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cart item ID")
    if not await permit_service._verify_cart_item_company(
        db, cid, current_user.company_id, current_user.role
    ):
        raise HTTPException(status_code=404, detail="Cart item not found")

    upload_dir = os.path.join("uploads", "permit-photos")
    os.makedirs(upload_dir, exist_ok=True)
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    progress = await permit_service.upsert_permit_progress(
        db, cid,
        learners_permit_photo_url=f"/uploads/permit-photos/{filename}",
        company_id=current_user.company_id, current_user_role=current_user.role,
    )
    return PermitProgressRead.model_validate(progress)