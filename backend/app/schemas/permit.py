import uuid
from datetime import date, datetime

from pydantic import BaseModel


class PermitProgressUpdate(BaseModel):
    start_date: date | None = None
    got_learners_permit_date: date | None = None
    learners_due_date: date | None = None
    learners_expiry_date: date | None = None
    tested_on_date: date | None = None
    expecting_permit_on_date: date | None = None
    delayed_days: int | None = None
    notes: str | None = None


class PermitProgressRead(BaseModel):
    id: uuid.UUID
    cart_item_id: uuid.UUID
    start_date: date | None
    got_learners_permit_date: date | None
    learners_due_date: date | None
    learners_expiry_date: date | None
    tested_on_date: date | None
    expecting_permit_on_date: date | None
    delayed_days: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
