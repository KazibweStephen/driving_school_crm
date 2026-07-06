import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── Company ──

class CompanyCreate(BaseModel):
    name: str = Field(..., max_length=200)
    code: str = Field(..., max_length=50)
    address: str | None = None
    phone: str | None = None
    email: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool | None = None


class CompanyRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None
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
    expense_date: datetime | None = None


class ExpenseRead(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    amount: float
    description: str | None = None
    category: str | None = None
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
