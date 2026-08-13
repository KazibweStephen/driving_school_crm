import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

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


class PackageWithRateCreate(PackageCreate):
    """Extends PackageCreate with optional commission rate fields."""
    rate_total_amount: Decimal | None = None
    rate_converter_pct: Decimal | None = None
    rate_primary_recommender_pct: Decimal = 0
    rate_secondary_recommender_pct: Decimal = 0
    rate_active_from: date | None = None
    rate_active_until: date | None = None
    rate_notes: str | None = None


class PackageWithRateUpdate(PackageUpdate):
    """Extends PackageUpdate with optional commission rate fields."""
    rate_total_amount: Decimal | None = None
    rate_converter_pct: Decimal | None = None
    rate_primary_recommender_pct: Decimal | None = None
    rate_secondary_recommender_pct: Decimal | None = None
    rate_active_from: date | None = None
    rate_active_until: date | None = None
    rate_notes: str | None = None
    clear_rate: bool = False


class PackageCommissionRateRead(BaseModel):
    id: uuid.UUID
    total_amount: Decimal
    converter_pct: Decimal
    primary_recommender_pct: Decimal
    secondary_recommender_pct: Decimal
    active_from: date
    active_until: date | None = None

    model_config = {"from_attributes": True}


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
    commission_rate: PackageCommissionRateRead | None = Field(
        default=None, validation_alias="commission_rates"
    )

    model_config = {"from_attributes": True}

    @field_validator("commission_rate", mode="before")
    @classmethod
    def _pick_active_rate(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            today = date.today()
            for rate in v:
                active_from = getattr(rate, "active_from", None)
                deactivated_at = getattr(rate, "deactivated_at", None)
                active_until = getattr(rate, "active_until", None)
                if (
                    active_from
                    and active_from <= today
                    and not deactivated_at
                    and (active_until is None or active_until >= today)
                ):
                    return rate
            return None
        return v


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
