import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class BulkOnboardingLesson(BaseModel):
    date: date
    duration_minutes: int = Field(ge=1, le=480)
    lesson_type: str = Field(pattern=r"^(practical|theory)$")
    instructor_id: str | None = None
    vehicle_id: uuid.UUID | None = None
    notes: str | None = None


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


class BulkOnboardingClient(BaseModel):
    phone: str = Field(min_length=1, max_length=20)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    branch_id: uuid.UUID | None = None
    document_date: date | None = None
    packages: list[BulkOnboardingPackage] = Field(min_length=1)


class BulkOnboardingRequest(BaseModel):
    clients: list[BulkOnboardingClient] = Field(min_length=1, max_length=50)


class BulkOnboardingResponse(BaseModel):
    created: int
    consultation_ids: list[uuid.UUID]
