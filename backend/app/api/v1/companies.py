import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_user
from app.core.database import get_db
from app.models.company import (
    Branch,
    Company,
    Expense,
    Sale,
    UserBranchAssignment,
    VehicleBranchAssignment,
)
from app.models.user import User
from app.schemas.company import (
    BranchCreate,
    BranchRead,
    BranchUpdate,
    CompanyCreate,
    CompanyRead,
    CompanyUpdate,
    ExpenseCreate,
    ExpenseRead,
    SaleCreate,
    SaleRead,
    UserBranchAssignmentCreate,
    UserBranchAssignmentRead,
    VehicleBranchAssignmentCreate,
    VehicleBranchAssignmentRead,
)

router = APIRouter(prefix="/api/v1/companies", tags=["Companies"])


# ── Company ──


@router.post("/", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    data: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    company = Company(
        name=data.name,
        code=data.code,
        address=data.address,
        phone=data.phone,
        email=data.email,
    )
    db.add(company)
    await db.flush()
    await db.refresh(company)

    from app.services.sms import seed_default_templates
    await seed_default_templates(db, company.id)

    await db.commit()
    await db.refresh(company)
    return CompanyRead.model_validate(company)


@router.get("/", response_model=list[CompanyRead])
async def list_companies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    result = await db.execute(select(Company).order_by(Company.created_at.desc()))
    companies = result.scalars().all()
    return [CompanyRead.model_validate(c) for c in companies]


@router.get("/{company_id}", response_model=CompanyRead)
async def get_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        cid = uuid.UUID(company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID",
        )
    result = await db.execute(select(Company).where(Company.id == cid))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    return CompanyRead.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: str,
    data: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        cid = uuid.UUID(company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID",
        )
    result = await db.execute(select(Company).where(Company.id == cid))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)
    await db.commit()
    await db.refresh(company)
    return CompanyRead.model_validate(company)


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        cid = uuid.UUID(company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID",
        )
    result = await db.execute(select(Company).where(Company.id == cid))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    await db.delete(company)
    await db.commit()


# ── Branch ──


@router.post("/{company_id}/branches", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
async def create_branch(
    company_id: str,
    data: BranchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        cid = uuid.UUID(company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID",
        )
    result = await db.execute(select(Company).where(Company.id == cid))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    branch = Branch(
        company_id=cid,
        name=data.name,
        code=data.code,
        address=data.address,
        phone=data.phone,
        email=data.email,
    )
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return BranchRead.model_validate(branch)


@router.get("/{company_id}/branches", response_model=list[BranchRead])
async def list_branches(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        cid = uuid.UUID(company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID",
        )
    result = await db.execute(
        select(Branch).where(Branch.company_id == cid).order_by(Branch.created_at.desc())
    )
    branches = result.scalars().all()
    return [BranchRead.model_validate(b) for b in branches]


@router.get("/branches/{branch_id}", response_model=BranchRead)
async def get_branch(
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    return BranchRead.model_validate(branch)


@router.patch("/branches/{branch_id}", response_model=BranchRead)
async def update_branch(
    branch_id: str,
    data: BranchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(branch, field, value)
    await db.commit()
    await db.refresh(branch)
    return BranchRead.model_validate(branch)


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    await db.delete(branch)
    await db.commit()


# ── User Branch Assignment ──


@router.post(
    "/branches/{branch_id}/assign-user",
    response_model=UserBranchAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def assign_user_to_branch(
    branch_id: str,
    data: UserBranchAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    assignment = UserBranchAssignment(
        user_id=data.user_id,
        branch_id=bid,
        role=data.role,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return UserBranchAssignmentRead.model_validate(assignment)


@router.delete(
    "/branch-assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_user_from_branch(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        aid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid assignment ID",
        )
    result = await db.execute(
        select(UserBranchAssignment).where(UserBranchAssignment.id == aid)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    await db.delete(assignment)
    await db.commit()


# ── Vehicle Branch Assignment ──


@router.post(
    "/branches/{branch_id}/assign-vehicle",
    response_model=VehicleBranchAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def assign_vehicle_to_branch(
    branch_id: str,
    data: VehicleBranchAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    assignment = VehicleBranchAssignment(
        vehicle_id=data.vehicle_id,
        branch_id=bid,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return VehicleBranchAssignmentRead.model_validate(assignment)


@router.delete(
    "/branch-vehicle-assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_vehicle_from_branch(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        aid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid assignment ID",
        )
    result = await db.execute(
        select(VehicleBranchAssignment).where(VehicleBranchAssignment.id == aid)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    await db.delete(assignment)
    await db.commit()


# ── Expense ──


@router.post(
    "/branches/{branch_id}/expenses",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_expense(
    branch_id: str,
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    expense = Expense(
        branch_id=bid,
        amount=data.amount,
        description=data.description,
        category=data.category,
        expense_date=data.expense_date,
        created_by_phone=current_user.phone,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return ExpenseRead.model_validate(expense)


@router.get(
    "/branches/{branch_id}/expenses",
    response_model=list[ExpenseRead],
)
async def list_expenses(
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(
        select(Expense)
        .where(Expense.branch_id == bid)
        .order_by(Expense.expense_date.desc())
    )
    expenses = result.scalars().all()
    return [ExpenseRead.model_validate(e) for e in expenses]


# ── Sale ──


@router.post(
    "/branches/{branch_id}/sales",
    response_model=SaleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_sale(
    branch_id: str,
    data: SaleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(select(Branch).where(Branch.id == bid))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    sale = Sale(
        branch_id=bid,
        consultation_id=data.consultation_id,
        amount=data.amount,
        description=data.description,
        sale_date=data.sale_date,
        created_by_phone=current_user.phone,
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale)
    return SaleRead.model_validate(sale)


@router.get(
    "/branches/{branch_id}/sales",
    response_model=list[SaleRead],
)
async def list_sales(
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    try:
        bid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid branch ID",
        )
    result = await db.execute(
        select(Sale)
        .where(Sale.branch_id == bid)
        .order_by(Sale.sale_date.desc())
    )
    sales = result.scalars().all()
    return [SaleRead.model_validate(s) for s in sales]
