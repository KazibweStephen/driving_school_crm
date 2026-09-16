import uuid
from datetime import date, datetime

from pydantic import BaseModel, computed_field


class PermitProgressUpdate(BaseModel):
    start_date: date | None = None
    got_learners_permit_date: date | None = None
    learners_due_date: date | None = None
    learners_expiry_date: date | None = None
    learners_permit_photo_url: str | None = None
    test_ready: bool | None = None
    waiting_for_permit: bool | None = None
    permit_paid: bool | None = None
    permit_received_date: date | None = None
    tested_on_date: date | None = None
    test_date: date | None = None
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
    learners_permit_photo_url: str | None
    test_ready: bool
    waiting_for_permit: bool
    permit_paid: bool
    permit_received_date: date | None
    tested_on_date: date | None
    test_date: date | None
    expecting_permit_on_date: date | None
    delayed_days: int | None
    notes: str | None
    eligibility_overridden: bool
    eligibility_override_reason: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EligibilityOverrideCreate(BaseModel):
    eligible: bool
    reason: str


class PermitAuditLogRead(BaseModel):
    id: uuid.UUID
    field_changed: str
    old_value: str | None
    new_value: str | None
    changed_by: str | None
    changed_by_name: str | None
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PermitTrackerRead(BaseModel):
    cart_item_id: uuid.UUID
    consultation_id: uuid.UUID
    client_name: str
    client_phone: str
    branch_id: uuid.UUID | None
    branch_name: str | None
    product_id: str
    product_name: str
    package_id: str | None
    package_name: str | None
    total_amount: float
    total_paid: float
    balance: float
    paid_ratio: float

    start_date: date | None
    got_learners_permit_date: date | None
    learners_due_date: date | None
    learners_expiry_date: date | None
    learners_permit_photo_url: str | None
    test_ready: bool
    waiting_for_permit: bool
    permit_paid: bool
    permit_received_date: date | None
    tested_on_date: date | None
    expecting_permit_on_date: date | None
    delayed_days: int | None
    notes: str | None
    eligibility_overridden: bool
    eligibility_override_reason: str | None
    test_date: date | None
    learner_expense_paid: bool = False
    testing_expense_paid: bool = False
    permit_expense_paid: bool = False

    @computed_field
    @property
    def status(self) -> str:
        if self.permit_received_date:
            return "permit_received"
        if self.permit_paid:
            return "permit_paid"
        if self.tested_on_date or self.waiting_for_permit:
            return "waiting_for_permit"
        if self.test_ready:
            return "test_ready"
        if not self.got_learners_permit_date:
            if self.eligibility_overridden:
                return "eligible"
            return "eligible" if self.paid_ratio >= 0.5 else "not_qualified"
        if self.learners_due_date and self.learners_due_date <= date.today():
            return "due_for_testing"
        return "learners_active"

    @computed_field
    @property
    def days_to_maturity(self) -> int | None:
        if self.learners_due_date:
            return (self.learners_due_date - date.today()).days
        return None

    @computed_field
    @property
    def days_to_expiry(self) -> int | None:
        if self.learners_expiry_date:
            return (self.learners_expiry_date - date.today()).days
        return None

    @computed_field
    @property
    def days_since_test(self) -> int | None:
        if self.tested_on_date:
            return (date.today() - self.tested_on_date).days
        return None

    model_config = {"from_attributes": False}


class PermitTrackerListResponse(BaseModel):
    trackers: list[PermitTrackerRead]
    total: int
    page: int
    page_size: int
    total_pages: int