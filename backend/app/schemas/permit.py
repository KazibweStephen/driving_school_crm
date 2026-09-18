import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, computed_field

from app.utils.timezones import today_local


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


class PermitExpenseItemCreate(BaseModel):
    category_code: str = Field(..., description="Expense category code, e.g. learner_permit_payment")
    amount: float
    description: str | None = None


class PermitExpenseRecordCreate(BaseModel):
    expenses: list[PermitExpenseItemCreate] = Field(..., min_length=1)
    expense_date: datetime | None = None


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
    discount_amount: float = 0.0
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
    learner_expense_status: str | None = None
    testing_expense_status: str | None = None
    permit_expense_status: str | None = None

    @computed_field
    @property
    def status(self) -> str:
        if self.permit_received_date:
            return "permit_received"
        if self.permit_paid:
            return "permit_paid"
        if self.tested_on_date or self.waiting_for_permit:
            if self.permit_expense_status == "pending":
                return "permit_pending_approval"
            if self.permit_expense_status == "approved":
                return "permit_pending_payment"
            return "waiting_for_permit"
        if self.test_ready:
            return "test_ready"
        if not self.got_learners_permit_date:
            if self.learner_expense_status == "pending":
                return "learner_pending_approval"
            if self.learner_expense_status == "approved":
                return "learner_pending_payment"
            if self.eligibility_overridden:
                return "eligible"
            return "eligible" if self.paid_ratio >= 0.5 else "not_qualified"
        if self.learners_due_date and self.learners_due_date <= today_local():
            if self.testing_expense_status == "pending":
                return "test_pending_approval"
            if self.testing_expense_status == "approved":
                return "test_pending_payment"
            return "due_for_testing"
        return "learners_active"

    @computed_field
    @property
    def days_to_maturity(self) -> int | None:
        if self.learners_due_date:
            return (self.learners_due_date - today_local()).days
        return None

    @computed_field
    @property
    def days_to_expiry(self) -> int | None:
        if self.learners_expiry_date:
            return (self.learners_expiry_date - today_local()).days
        return None

    @computed_field
    @property
    def days_since_test(self) -> int | None:
        if self.tested_on_date:
            return (today_local() - self.tested_on_date).days
        return None

    model_config = {"from_attributes": False}


class PermitTrackerListResponse(BaseModel):
    trackers: list[PermitTrackerRead]
    total: int
    page: int
    page_size: int
    total_pages: int