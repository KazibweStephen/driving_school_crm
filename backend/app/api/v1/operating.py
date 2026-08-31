import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.user import User
from app.schemas.operating import (
    OperatingClientAccount,
    OperatingEntryCreate,
    OperatingEntryRead,
    OperatingFundBranch,
    OperatingLoanRepay,
    OperatingOwedSummary,
    OperatingPostFromClients,
    OperatingPostResult,
    OperatingReconcileBack,
    OperatingReconcileResult,
    OperatingSummary,
)
from app.services import operating as operating_service
from app.services import operating_clients as operating_clients_service

from app.models.company import BranchTransfer

router = APIRouter(prefix="/operating", tags=["operating"])


def _read(e) -> OperatingEntryRead:
    return OperatingEntryRead(
        id=e.id,
        company_id=e.company_id,
        branch_id=e.branch_id,
        entry_type=e.entry_type.value if hasattr(e.entry_type, "value") else e.entry_type,
        direction=e.direction.value if hasattr(e.direction, "value") else e.direction,
        amount=e.amount,
        description=e.description,
        reference=e.reference,
        entry_date=e.entry_date,
        loan_entry_id=e.loan_entry_id,
        transfer_id=e.transfer_id,
        target_pool=e.target_pool,
        created_by=e.created_by,
        created_at=e.created_at,
    )


@router.get("/summary", response_model=OperatingSummary)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.operating")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    return await operating_service.get_summary(db, current_user.company_id)


@router.get("/entries", response_model=list[OperatingEntryRead])
async def list_entries(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.operating")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    entries = await operating_service.list_entries(db, current_user.company_id, limit)
    return [_read(e) for e in entries]


@router.post("/entries", response_model=OperatingEntryRead, status_code=status.HTTP_201_CREATED)
async def create_entry(
    data: OperatingEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.capital")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    entry = await operating_service.create_entry(
        db,
        current_user.company_id,
        entry_type=data.entry_type,
        amount=data.amount,
        description=data.description,
        reference=data.reference,
        entry_date=data.entry_date,
        created_by=current_user.phone,
    )
    await db.commit()
    await db.refresh(entry)
    return _read(entry)


@router.post("/fund-branch", response_model=dict, status_code=status.HTTP_201_CREATED)
async def fund_branch(
    data: OperatingFundBranch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.fund")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    transfer: BranchTransfer = await operating_service.fund_branch(
        db,
        company_id=current_user.company_id,
        to_branch_id=data.to_branch_id,
        pool=data.pool,
        amount=data.amount,
        description=data.description,
        current_user_role=current_user.role,
        initiated_by=current_user.phone,
    )
    await db.commit()
    return {
        "id": str(transfer.id),
        "status": transfer.status.value if hasattr(transfer.status, "value") else transfer.status,
        "amount": float(transfer.amount),
        "to_branch_id": str(transfer.to_branch_id),
        "pool": data.pool,
    }


@router.post("/repay-loan", response_model=OperatingEntryRead, status_code=status.HTTP_201_CREATED)
async def repay_loan(
    data: OperatingLoanRepay,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.capital")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    entry = await operating_service.repay_loan(
        db,
        company_id=current_user.company_id,
        loan_entry_id=data.loan_entry_id,
        amount=data.amount,
        description=data.description,
        created_by=current_user.phone,
    )
    await db.commit()
    await db.refresh(entry)
    return _read(entry)


@router.get("/client-accounts", response_model=list[OperatingClientAccount])
async def list_client_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.operating")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    accounts = await operating_clients_service.list_client_accounts(
        db, current_user.company_id
    )
    return [OperatingClientAccount(**a) for a in accounts]


@router.post(
    "/post-from-clients",
    response_model=list[OperatingPostResult],
    status_code=status.HTTP_201_CREATED,
)
async def post_from_clients(
    data: OperatingPostFromClients,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.capital")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    results = await operating_clients_service.post_from_clients(
        db,
        current_user.company_id,
        [{"consultation_id": i.consultation_id, "amount": i.amount, "reason": i.reason} for i in data.items],
        data.notes,
        current_user.phone,
    )
    return [OperatingPostResult(**r) for r in results]


@router.get("/owed-to-clients", response_model=OperatingOwedSummary)
async def owed_to_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.operating")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    return await operating_clients_service.owed_to_clients(
        db, current_user.company_id
    )


@router.post(
    "/reconcile-back",
    response_model=list[OperatingReconcileResult],
    status_code=status.HTTP_201_CREATED,
)
async def reconcile_back(
    data: OperatingReconcileBack,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("finance.capital")),
):
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Company not resolved")
    results = await operating_clients_service.reconcile_back(
        db,
        current_user.company_id,
        [{"post_id": i.post_id, "amount": i.amount} for i in data.items],
        current_user.phone,
    )
    return [OperatingReconcileResult(**r) for r in results]
