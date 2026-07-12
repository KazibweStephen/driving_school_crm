from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from typing import Optional


class CommissionRateCreate(BaseModel):
    name: str
    amount: Decimal
    lesson_type: Optional[str] = None
    transmission_type: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None


class CommissionRateUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    lesson_type: Optional[str] = None
    transmission_type: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CommissionRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    amount: Decimal
    lesson_type: Optional[str] = None
    transmission_type: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CommissionCreate(BaseModel):
    instructor_id: str
    client_lesson_id: Optional[UUID] = None
    training_session_id: Optional[UUID] = None
    commission_rate_id: Optional[UUID] = None
    amount: Decimal
    notes: Optional[str] = None


class CommissionUpdate(BaseModel):
    status: Optional[str] = None
    paid_at: Optional[datetime] = None
    paid_by: Optional[str] = None
    notes: Optional[str] = None


class CommissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    instructor_id: str
    client_lesson_id: Optional[UUID] = None
    training_session_id: Optional[UUID] = None
    commission_rate_id: Optional[UUID] = None
    amount: Decimal
    status: str
    paid_at: Optional[datetime] = None
    paid_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    instructor_name: Optional[str] = None
    client_name: Optional[str] = None
    lesson_title: Optional[str] = None


class CommissionListResponse(BaseModel):
    items: list[CommissionRead]
    total: int
    page: int
    page_size: int
