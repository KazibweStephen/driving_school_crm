import uuid
from datetime import datetime

from pydantic import BaseModel


class CartItemCreate(BaseModel):
    product_id: str
    package_id: str | None = None
    notes: str | None = None
    is_important: bool = False


class CartItemUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    is_important: bool | None = None
    recovery_reason: str | None = None


class CartItemRead(BaseModel):
    id: uuid.UUID
    consultation_id: uuid.UUID
    product_id: str
    package_id: str | None
    status: str
    notes: str | None
    is_important: bool
    recovery_reason: str | None
    requires_driving_training: bool = False
    requires_theory_training: bool = False
    requires_permit_processing: bool = False
    driving_training_duration_days: int | None = None
    theory_training_hours: int | None = None
    permit_processing_duration_days: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
