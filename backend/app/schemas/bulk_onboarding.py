import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BulkOnboardingLesson(BaseModel):
    date: date
    duration_minutes: int = Field(ge=1, le=480)
    lesson_type: str = Field(pattern=r"^(practical|theory)$")
    instructor_id: str | None = None
    vehicle_id: uuid.UUID | None = None
    notes: str | None = None
    template_item_id: uuid.UUID | None = None
    title: str | None = None
    lesson_objectives: list[str] = []
    practical_objectives: list[str] = []
    status: str | None = Field(default=None, pattern=r"^(completed|scheduled|pending)$")


class BulkOnboardingInstallment(BaseModel):
    receipt_number: str = Field(min_length=1, max_length=100)
    document_date: date
    amount: Decimal = Field(gt=0)
    received_by_phone: str = Field(min_length=1, max_length=20)


class BulkOnboardingPackage(BaseModel):
    product_id: str = Field(min_length=1, max_length=36)
    package_id: str | None = None
    installments: list[BulkOnboardingInstallment] = Field(min_length=1)
    lessons: list[BulkOnboardingLesson] = []
    transmission_type: str | None = Field(default=None, pattern=r"^(manual|automatic|both)$")
    lesson_plan_template_id: uuid.UUID | None = None
    discount_id: uuid.UUID | None = None


class BulkOnboardingClient(BaseModel):
    phone: str = Field(min_length=1, max_length=20)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    branch_id: uuid.UUID | None = None
    document_date: date | None = None
    converter_id: str | None = None
    primary_recommender_id: str | None = None
    secondary_recommender_id: str | None = None
    packages: list[BulkOnboardingPackage] = Field(min_length=1)


class BulkOnboardingRequest(BaseModel):
    clients: list[BulkOnboardingClient] = Field(min_length=1, max_length=50)


class BulkOnboardingResponse(BaseModel):
    created: int
    consultation_ids: list[uuid.UUID]
    payment_ids: list[uuid.UUID] = []


class OnboardedPaymentRead(BaseModel):
    id: uuid.UUID
    document_date: date | None
    receipt_number: str | None
    amount: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    received_by_phone: str | None = None
    cancelled_at: datetime | None = None


class OnboardedLessonRead(BaseModel):
    id: uuid.UUID
    day_number: int
    title: str
    scheduled_date: date | None
    duration_minutes: int
    lesson_type: str
    status: str
    instructor_id: str | None = None
    vehicle_id: uuid.UUID | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}


class OnboardedPlanRead(BaseModel):
    id: uuid.UUID
    start_date: datetime | None
    transmission_type: str | None
    template_id: uuid.UUID | None
    lessons: list[OnboardedLessonRead] = []


class OnboardedPackageRead(BaseModel):
    cart_item_id: uuid.UUID
    product_id: str
    package_id: str | None
    status: str
    total_amount: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    discount_id: uuid.UUID | None = None
    discount_amount: Decimal = Decimal("0")
    converter_id: str | None = None
    primary_recommender_id: str | None = None
    secondary_recommender_id: str | None = None
    payments: list[OnboardedPaymentRead] = []
    plan: OnboardedPlanRead | None = None


class OnboardedClientRead(BaseModel):
    id: uuid.UUID
    phone: str
    first_name: str
    middle_name: str | None
    last_name: str | None
    location: str | None
    branch_id: uuid.UUID | None
    branch_name: str | None
    document_date: date | None
    status: str
    packages: list[OnboardedPackageRead] = []


class OnboardedClientListResponse(BaseModel):
    clients: list[OnboardedClientRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class BulkCorrectionPayment(BaseModel):
    id: uuid.UUID | None = None
    product_id: str | None = None
    package_id: str | None = None
    document_date: date | None = None
    receipt_number: str | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    received_by_phone: str | None = None


class BulkCorrectionLessonEdit(BaseModel):
    id: uuid.UUID
    scheduled_date: date | None = None
    status: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=480)
    instructor_id: str | None = None
    vehicle_id: uuid.UUID | None = None
    notes: str | None = None


class BulkPlanEdit(BaseModel):
    plan_id: uuid.UUID
    start_date: date | None = None
    transmission_type: str | None = None
    template_id: uuid.UUID | None = None
    lessons: list[BulkCorrectionLessonEdit] = []


class BulkPlanRegenerate(BaseModel):
    plan_id: uuid.UUID
    template_id: uuid.UUID | None = None
    transmission_type: str | None = None
    start_date: date | None = None
    lessons: list[BulkOnboardingLesson] = []


class BulkDiscountCorrection(BaseModel):
    cart_item_id: uuid.UUID
    discount_id: uuid.UUID | None = None


class BulkPackageCorrection(BaseModel):
    cart_item_id: uuid.UUID
    product_id: str | None = Field(default=None, min_length=1, max_length=36)
    package_id: str | None = Field(default=None, max_length=36)


class BulkOnboardingCorrection(BaseModel):
    phone: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    document_date: date | None = None
    packages: list[BulkPackageCorrection] = []
    payments: list[BulkCorrectionPayment] = []
    remove_payment_ids: list[uuid.UUID] = []
    plans: list[BulkPlanEdit] = []
    regenerate_plans: list[BulkPlanRegenerate] = []
    discounts: list[BulkDiscountCorrection] = []


class BulkCorrectionResult(BaseModel):
    consultation_id: uuid.UUID
    document_date: date | None
    fields_updated: int = 0
    packages_updated: int = 0
    payments_updated: int
    payments_created: int
    payments_removed: int
    discounts_updated: int = 0
    lessons_updated: int
    plans_regenerated: int
