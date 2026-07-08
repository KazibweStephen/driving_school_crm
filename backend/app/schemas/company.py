import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.company import CollectionStatus


# ── Company ──

class CompanyCreate(BaseModel):
    name: str = Field(..., max_length=200)
    code: str = Field(..., max_length=50)
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    currency: str = "USD"


class CompanyUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    currency: str | None = None
    is_active: bool | None = None


class CompanyRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Branch ──

class BranchCreate(BaseModel):
    company_id: uuid.UUID | None = None
    name: str = Field(..., max_length=200)
    code: str = Field(..., max_length=50)
    address: str | None = None
    phone: str | None = None
    email: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool | None = None


class BranchRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    code: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── User Branch Assignment ──

class UserBranchAssignmentCreate(BaseModel):
    user_id: str
    branch_id: uuid.UUID
    role: str | None = None


class UserBranchAssignmentRead(BaseModel):
    id: uuid.UUID
    user_id: str
    branch_id: uuid.UUID
    role: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Vehicle Branch Assignment ──

class VehicleBranchAssignmentCreate(BaseModel):
    vehicle_id: uuid.UUID
    branch_id: uuid.UUID


class VehicleBranchAssignmentRead(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    branch_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Expense ──

class ExpenseCreate(BaseModel):
    branch_id: uuid.UUID
    amount: float
    description: str | None = None
    category: str | None = None
    mileage: int | None = None
    vehicle_id: uuid.UUID | None = None
    expense_date: datetime | None = None
    status: str | None = "pending"


class ExpenseUpdate(BaseModel):
    status: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    paid_by: str | None = None
    paid_at: datetime | None = None
    rejection_reason: str | None = None
    receipt_url: str | None = None
    vehicle_id: uuid.UUID | None = None


class ExpenseRead(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    amount: float
    description: str | None = None
    category: str | None = None
    mileage: int | None = None
    vehicle_id: uuid.UUID | None = None
    status: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    paid_by: str | None = None
    paid_at: datetime | None = None
    rejection_reason: str | None = None
    receipt_url: str | None = None
    expense_date: datetime
    created_by_phone: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Sale ──

class SaleCreate(BaseModel):
    branch_id: uuid.UUID
    consultation_id: uuid.UUID | None = None
    amount: float
    description: str | None = None
    sale_date: datetime | None = None


class SaleRead(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    consultation_id: uuid.UUID | None = None
    amount: float
    description: str | None = None
    sale_date: datetime
    created_by_phone: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Borrowed Money ──

class BorrowedMoneyCreate(BaseModel):
    branch_id: uuid.UUID
    direction: str = "borrow"
    amount: Decimal = Field(..., decimal_places=2)
    interest_rate: float | None = None
    description: str | None = None
    lender_name: str | None = None
    borrower_name: str | None = None
    due_date: datetime | None = None


class BorrowedMoneyUpdate(BaseModel):
    direction: str | None = None
    amount: Decimal | None = None
    interest_rate: float | None = None
    description: str | None = None
    lender_name: str | None = None
    borrower_name: str | None = None
    due_date: datetime | None = None
    status: str | None = None


class BorrowedMoneyRead(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    direction: str
    amount: Decimal
    interest_rate: float | None = None
    description: str | None = None
    lender_name: str | None = None
    borrower_name: str | None = None
    due_date: datetime | None = None
    status: str
    created_by_phone: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Collection ──

class CollectionCreate(BaseModel):
    installment_id: uuid.UUID
    consultation_id: uuid.UUID
    amount_due: Decimal = Field(..., decimal_places=2)
    amount_collected: Decimal = Field(default=Decimal("0.00"), decimal_places=2)
    notes: str | None = None


class CollectionUpdate(BaseModel):
    amount_collected: Decimal | None = None
    status: CollectionStatus | None = None
    notes: str | None = None
    collected_by: str | None = None
    collected_at: datetime | None = None


class CollectionRead(BaseModel):
    id: uuid.UUID
    installment_id: uuid.UUID
    consultation_id: uuid.UUID
    amount_due: Decimal
    amount_collected: Decimal
    status: CollectionStatus
    dunning_count: int
    last_dunning_at: datetime | None = None
    notes: str | None = None
    collected_by: str | None = None
    collected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
