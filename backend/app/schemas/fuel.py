from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from typing import Optional


class FuelRateCreate(BaseModel):
    vehicle_id: UUID
    rate_per_lesson: Decimal
    is_active: bool = True
    effective_from: Optional[date] = None
    notes: Optional[str] = None


class FuelRateUpdate(BaseModel):
    rate_per_lesson: Optional[Decimal] = None
    is_active: Optional[bool] = None
    effective_from: Optional[date] = None
    notes: Optional[str] = None


class FuelRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    vehicle_id: UUID
    rate_per_lesson: Decimal
    is_active: bool
    effective_from: date
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    vehicle_name: Optional[str] = None
    vehicle_plate: Optional[str] = None


class FuelRefuelingCreate(BaseModel):
    vehicle_id: UUID
    fuel_rate_id: UUID
    amount: Decimal
    liters: Optional[Decimal] = None
    refueled_at: Optional[datetime] = None
    odometer_reading: Optional[int] = None
    notes: Optional[str] = None


class FuelRefuelingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    vehicle_id: UUID
    fuel_rate_id: UUID
    amount: Decimal
    liters: Optional[Decimal] = None
    lessons_covered: int
    refueled_at: datetime
    odometer_reading: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    vehicle_name: Optional[str] = None
    vehicle_plate: Optional[str] = None
    rate_per_lesson: Optional[Decimal] = None
    remaining_lessons: Optional[int] = None


class FuelRefuelingListResponse(BaseModel):
    items: list[FuelRefuelingRead]
    total: int
    page: int
    page_size: int


class FuelRateListResponse(BaseModel):
    items: list[FuelRateRead]
    total: int
    page: int
    page_size: int


class FuelAlert(BaseModel):
    vehicle_id: UUID
    vehicle_name: str
    vehicle_plate: str
    remaining_lessons: int
    last_refueling_id: UUID
    last_refueling_date: datetime
    lessons_covered: int
