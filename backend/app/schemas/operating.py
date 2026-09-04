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
    funded_by: str | None = None
    repay_from_profit: bool = False

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
    funded_by: str | None
    repay_from_profit: bool
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


class OperatingClientAccount(BaseModel):
    consultation_id: uuid.UUID
    client_name: str
    client_phone: str
    confirmed_profit: float
    expected_profit: float
    funds_available: float
    already_posted: float
    unreconciled_excess: float


class OperatingPostItem(BaseModel):
    consultation_id: uuid.UUID
    amount: Decimal = Field(..., decimal_places=2, gt=0)
    reason: str | None = None


class OperatingPostFromClients(BaseModel):
    items: list[OperatingPostItem] = Field(..., min_length=1)
    notes: str | None = None


class OperatingPostResult(BaseModel):
    post_id: uuid.UUID
    consultation_id: uuid.UUID
    client_name: str
    amount: float
    confirmed_profit: float
    expected_profit: float
    excess: float


class OperatingOwedPost(BaseModel):
    post_id: uuid.UUID
    amount: float
    excess: float
    reconciled: float
    owed_back: float


class OperatingOwedAccount(BaseModel):
    consultation_id: uuid.UUID
    posted: float
    confirmed_profit: float
    excess: float
    reconciled: float
    owed_back: float
    posts: list[OperatingOwedPost] = []


class OperatingOwedSummary(BaseModel):
    total_taken: float
    total_confirmed_profit: float
    total_excess: float
    total_reconciled: float
    total_owed_back: float
    accounts: list[OperatingOwedAccount]


class OperatingReconcileItem(BaseModel):
    post_id: uuid.UUID
    amount: Decimal = Field(..., decimal_places=2, gt=0)


class OperatingReconcileBack(BaseModel):
    items: list[OperatingReconcileItem] = Field(..., min_length=1)


class OperatingReconcileResult(BaseModel):
    post_id: uuid.UUID
    consultation_id: uuid.UUID
    amount: float
    reconciled_total: float
