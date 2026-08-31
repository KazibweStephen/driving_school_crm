import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.operating import OperatingDirection, OperatingEntryType


class OperatingEntryCreate(BaseModel):
    entry_type: OperatingEntryType
    amount: Decimal = Field(..., decimal_places=2, gt=0)
    description: str = Field(..., min_length=3)
    reference: str | None = None
    entry_date: date | None = None

    class Config:
        use_enum_values = True


class OperatingEntryRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: uuid.UUID | None
    entry_type: str
    direction: str
    amount: Decimal
    description: str
    reference: str | None
    entry_date: date | None
    loan_entry_id: uuid.UUID | None
    transfer_id: uuid.UUID | None
    target_pool: str | None
    created_by: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class OperatingSummary(BaseModel):
    balance: float
    equity: float
    loans_outstanding: float
    loans_received: float
    profit: float
    branch_funding_out: float
    operating_expenses: float


class OperatingFundBranch(BaseModel):
    to_branch_id: uuid.UUID
    pool: str  # petty_cash | client_accounts
    amount: Decimal = Field(..., decimal_places=2, gt=0)
    description: str | None = None
    method: str | None = None


class OperatingLoanRepay(BaseModel):
    loan_entry_id: uuid.UUID
    amount: Decimal = Field(..., decimal_places=2, gt=0)
    description: str | None = None
