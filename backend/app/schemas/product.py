import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.product import EntityStatus


class PackageCreate(BaseModel):
    product_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=200)
    price: Decimal = Field(..., gt=0, decimal_places=2)
    duration_label: str | None = None
    requires_driving_training: bool = False
    requires_theory_training: bool = False
    requires_permit_processing: bool = False
    driving_training_duration_days: int | None = None
    theory_training_hours: int | None = None
    permit_processing_duration_days: int | None = None
    is_extension: bool = False
    extension_days: int | None = None


class PackageUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    price: Decimal | None = Field(None, gt=0, decimal_places=2)
    duration_label: str | None = None
    status: EntityStatus | None = None
    requires_driving_training: bool | None = None
    requires_theory_training: bool | None = None
    requires_permit_processing: bool | None = None
    driving_training_duration_days: int | None = None
    theory_training_hours: int | None = None
    permit_processing_duration_days: int | None = None
    is_extension: bool | None = None
    extension_days: int | None = None


class PackageRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    name: str
    price: Decimal
    duration_label: str | None
    requires_driving_training: bool
    requires_theory_training: bool
    requires_permit_processing: bool
    driving_training_duration_days: int | None
    theory_training_hours: int | None
    permit_processing_duration_days: int | None
    is_extension: bool
    extension_days: int | None
    status: EntityStatus
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    duration_label: str | None = None
    description: str | None = None
    is_extension: bool = False
    company_id: uuid.UUID | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    duration_label: str | None = None
    description: str | None = None
    status: EntityStatus | None = None
    is_extension: bool | None = None
    company_id: uuid.UUID | None = None


class ProductRead(BaseModel):
    id: uuid.UUID
    name: str
    duration_label: str | None
    description: str | None
    is_extension: bool
    status: EntityStatus
    company_id: uuid.UUID | None = None
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime
    packages: list[PackageRead]

    model_config = {"from_attributes": True}


class ProductListParams(BaseModel):
    search: str | None = Field(None, max_length=50)
    status: EntityStatus | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ProductListResponse(BaseModel):
    products: list[ProductRead]
    total: int
    page: int
    page_size: int
    total_pages: int
