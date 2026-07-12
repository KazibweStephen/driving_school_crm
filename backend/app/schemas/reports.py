from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel
from typing import Optional


class CommissionReportItem(BaseModel):
    instructor_id: str
    instructor_name: Optional[str] = None
    total_commissions: Decimal
    total_count: int
    paid_count: int
    pending_count: int
    paid_amount: Decimal
    pending_amount: Decimal


class CommissionReportResponse(BaseModel):
    items: list[CommissionReportItem]
    grand_total: Decimal
    grand_paid: Decimal
    grand_pending: Decimal


class FuelReportItem(BaseModel):
    vehicle_id: UUID
    vehicle_name: Optional[str] = None
    vehicle_plate: Optional[str] = None
    total_refuelings: int
    total_amount: Decimal
    total_liters: Optional[Decimal] = None
    total_lessons_covered: int


class FuelReportResponse(BaseModel):
    items: list[FuelReportItem]
    grand_total: Decimal
    grand_liters: Optional[Decimal] = None
    grand_lessons_covered: int


class FinancialSummary(BaseModel):
    total_revenue: Decimal
    total_expenses: Decimal
    total_commissions: Decimal
    net_revenue: Decimal
    period_label: str


class DashboardSummary(BaseModel):
    total_revenue_today: Decimal
    total_revenue_month: Decimal
    total_expenses_month: Decimal
    total_commissions_month: Decimal
    active_clients: int
    pending_follow_ups: int
    pending_commissions: int
    fuel_alerts: list["FuelAlert"] = []

    upcoming_lessons_today: int
    ongoing_lessons: int


from app.schemas.fuel import FuelAlert
DashboardSummary.model_rebuild()
