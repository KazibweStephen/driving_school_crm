import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class InstallmentCreate(BaseModel):
    due_date: date
    amount: Decimal = Field(..., gt=0, decimal_places=2)


class PaymentCreate(BaseModel):
    product_id: str = Field(..., min_length=1)
    package_id: str | None = None
    total_amount: Decimal = Field(..., gt=0, decimal_places=2)
    notes: str | None = None
    receipt_number: str | None = Field(None, max_length=100)
    installments: list[InstallmentCreate] = []


class InstallmentRead(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    due_date: date
    amount: Decimal
    status: str
    paid_date: date | None
    paid_amount: Decimal | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaymentRead(BaseModel):
    id: uuid.UUID
    consultation_id: uuid.UUID
    product_id: str
    package_id: str | None
    total_amount: Decimal
    total_paid: Decimal
    balance: Decimal
    notes: str | None
    receipt_number: str | None
    system_receipt_number: str
    created_at: datetime
    updated_at: datetime
    installments: list[InstallmentRead]

    model_config = {"from_attributes": True}


class InstallmentUpdate(BaseModel):
    paid_date: date | None = None
    paid_amount: Decimal | None = None
    notes: str | None = None


class ClientSummary(BaseModel):
    id: uuid.UUID
    phone: str
    first_name: str
    middle_name: str | None
    last_name: str | None
    location: str | None
    interest_level: str | None
    active_products_count: int = 0
    upgradable_products_count: int = 0
    total_paid: Decimal = Decimal("0.00")
    last_payment_date: date | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ClientListResponse(BaseModel):
    clients: list[ClientSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
