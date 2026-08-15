import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.discount import DiscountAppliesTo, DiscountStatus, DiscountType


class DiscountCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    discount_type: DiscountType
    discount_value: float = Field(..., gt=0)
    applies_to: DiscountAppliesTo = DiscountAppliesTo.ALL
    product_ids: list[uuid.UUID] | None = None
    package_ids: list[uuid.UUID] | None = None
    start_date: date
    end_date: date | None = None
    is_active: bool = True
    branch_id: uuid.UUID
    max_uses: int | None = Field(None, ge=1)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date is not None and self.start_date > self.end_date:
            raise ValueError("start_date must be before or equal to end_date")
        return self

    @field_validator("discount_value")
    @classmethod
    def validate_discount_value(cls, v, info):
        data = info.data
        if data.get("discount_type") == DiscountType.PERCENTAGE and v > 100:
            raise ValueError("Percentage discount cannot exceed 100")
        return v

    @model_validator(mode="after")
    def check_applies_to_ids(self):
        if self.applies_to == DiscountAppliesTo.PRODUCT and not self.product_ids:
            raise ValueError("product_ids required when applies_to is 'product'")
        if self.applies_to == DiscountAppliesTo.PACKAGE and not self.package_ids:
            raise ValueError("package_ids required when applies_to is 'package'")
        return self


class DiscountUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    discount_value: float | None = Field(None, gt=0)
    applies_to: DiscountAppliesTo | None = None
    product_ids: list[uuid.UUID] | None = None
    package_ids: list[uuid.UUID] | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    max_uses: int | None = Field(None, ge=1)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date is not None and self.start_date is not None and self.start_date > self.end_date:
            raise ValueError("start_date must be before or equal to end_date")
        return self

    @field_validator("discount_value")
    @classmethod
    def validate_discount_value(cls, v, info):
        data = info.data
        if v is not None and data.get("discount_type") == DiscountType.PERCENTAGE and v > 100:
            raise ValueError("Percentage discount cannot exceed 100")
        return v


class DiscountApprove(BaseModel):
    reason: str | None = Field(None, max_length=500)


class DiscountReject(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class DiscountRead(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    discount_type: str
    discount_value: float
    applies_to: str
    product_ids: list[uuid.UUID] | None = None
    package_ids: list[uuid.UUID] | None = None
    start_date: date
    end_date: date | None
    is_active: bool
    status: str
    requested_by: str
    requested_by_name: str | None = None
    approved_by: str | None
    approved_at: datetime | None
    rejection_reason: str | None
    branch_id: uuid.UUID
    branch_name: str | None = None
    company_id: uuid.UUID
    max_uses: int | None
    used_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiscountListResponse(BaseModel):
    discounts: list[DiscountRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class CartItemDiscountRead(BaseModel):
    id: uuid.UUID
    cart_item_id: uuid.UUID
    discount_id: uuid.UUID
    discount_code: str
    discount_name: str
    applied_amount: float
    applied_by: str
    applied_at: datetime

    model_config = {"from_attributes": True}


class ApplyDiscountRequest(BaseModel):
    discount_id: uuid.UUID
    cart_item_id: uuid.UUID


class RemoveDiscountRequest(BaseModel):
    cart_item_discount_id: uuid.UUID


class DiscountNotification(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    discount_type: str
    discount_value: float
    branch_id: uuid.UUID
    branch_name: str
    requested_by: str
    requested_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DiscountNotificationResponse(BaseModel):
    items: list[DiscountNotification]
    total: int
