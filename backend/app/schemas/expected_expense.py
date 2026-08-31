from datetime import datetime
from decimal import Decimal
import uuid

from pydantic import BaseModel, Field


class ExpectedExpenseItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: uuid.UUID | None = None
    unit_cost: Decimal = Field(0, ge=0, decimal_places=2)
    default_multiplier: Decimal = Field(1, ge=0, decimal_places=2)
    description: str | None = None
    is_active: bool = True


class ExpectedExpenseItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    category_id: uuid.UUID | None = None
    unit_cost: Decimal | None = Field(None, ge=0, decimal_places=2)
    default_multiplier: Decimal | None = Field(None, ge=0, decimal_places=2)
    description: str | None = None
    is_active: bool | None = None


class ExpectedExpenseItemRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID | None
    name: str
    category_id: uuid.UUID | None
    category_name: str | None = None
    unit_cost: Decimal
    default_multiplier: Decimal
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PackageExpenseLinkLine(BaseModel):
    link_id: uuid.UUID
    item_id: uuid.UUID
    name: str
    category_id: uuid.UUID | None
    category_name: str | None
    unit_cost: float
    multiplier: float
    line_total: float


class PackageExpectedExpensesRead(BaseModel):
    package_id: uuid.UUID
    items: list[PackageExpenseLinkLine] = Field(default_factory=list)
    total: float


class PackageExpenseLinkInput(BaseModel):
    item_id: uuid.UUID
    multiplier: Decimal | None = Field(None, ge=0, decimal_places=2)


class PackageExpenseLinkSetInput(BaseModel):
    links: list[PackageExpenseLinkInput] = Field(default_factory=list)
