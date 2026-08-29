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
    document_date: date | None = None
    branch_id: uuid.UUID | None = None


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
    branch_id: uuid.UUID | None = None
    total_amount: Decimal
    total_paid: Decimal
    balance: Decimal
    document_date: date | None = None
    notes: str | None
    receipt_number: str | None
    system_receipt_number: str
    transaction_id: str
    created_at: datetime
    updated_at: datetime
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None
    cancellation_reason: str | None = None
    installments: list[InstallmentRead]

    model_config = {"from_attributes": True}


class FutureInstallmentAdjust(BaseModel):
    installment_id: uuid.UUID
    due_date: date


class InstallmentUpdate(BaseModel):
    paid_date: date | None = None
    paid_amount: Decimal | None = None
    notes: str | None = None
    push_forward_date: date | None = None
    future_installments: list[FutureInstallmentAdjust] | None = None


class CollectionPaymentCreate(BaseModel):
    """An independent collection payment against a product on a consultation.

    Each collection is its own Payment row (own receipt numbers/transaction id)
    instead of accumulating onto the original schedule Payment row.
    """
    product_id: str = Field(..., min_length=1)
    package_id: str | None = None
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    branch_id: uuid.UUID | None = None
    document_date: date | None = None
    receipt_number: str | None = Field(None, max_length=100)
    notes: str | None = None
    schedule_adjustments: list[FutureInstallmentAdjust] | None = None
    future_schedule: list[InstallmentCreate] | None = None


class ClientActiveProduct(BaseModel):
    cart_item_id: uuid.UUID
    product_id: str
    product_name: str = ""
    package_id: str | None = None
    package_name: str | None = None
    status: str
    total: Decimal = Decimal("0.00")
    paid: Decimal = Decimal("0.00")
    balance: Decimal = Decimal("0.00")
    commission_earned: Decimal = Decimal("0.00")
    commission_total: Decimal = Decimal("0.00")


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
    products: list[ClientActiveProduct] = []

    model_config = {"from_attributes": True}


class PaymentWithClient(BaseModel):
    id: uuid.UUID
    consultation_id: uuid.UUID
    product_id: str
    product_name: str = ""
    package_id: str | None = None
    branch_id: uuid.UUID | None = None
    branch_name: str | None = None
    client_name: str = ""
    client_phone: str = ""
    created_by_name: str | None = None
    total_amount: Decimal
    total_paid: Decimal
    balance: Decimal
    document_date: date | None = None
    notes: str | None = None
    receipt_number: str | None = None
    system_receipt_number: str
    transaction_id: str
    created_at: datetime
    updated_at: datetime
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None
    cancellation_reason: str | None = None

    model_config = {"from_attributes": True}


class PaymentTotals(BaseModel):
    total_amount_sum: Decimal = Decimal("0.00")
    total_paid_sum: Decimal = Decimal("0.00")
    total_balance_sum: Decimal = Decimal("0.00")


class PaymentListResponse(BaseModel):
    payments: list[PaymentWithClient]
    total: int
    page: int
    page_size: int
    total_pages: int
    totals: PaymentTotals = PaymentTotals()


class ClientListResponse(BaseModel):
    clients: list[ClientSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
