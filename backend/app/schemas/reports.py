from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel
from datetime import datetime
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

# --------------------------------------------------------------------------- #
# Period reports (week / month / quarter / year)
# --------------------------------------------------------------------------- #
class PeriodTotals(BaseModel):
    """Money and counts for the selected period.

    ``total_sales`` is cash from NEW sales (the first payment recorded for a
    consultation); ``total_collections`` is cash collected against earlier
    sales. ``old_client_collections`` is the slice of collections that came
    from clients who already existed before the period started.
    """

    total_sales: float
    sales_payments: int
    total_collections: float
    collection_payments: int
    total_cash_received: float
    old_client_collections: float
    new_client_cash: float
    old_client_share: float
    consultations: int
    conversions: int
    converted_clients: int
    conversion_rate: float
    outstanding_total: float
    outstanding_clients: int
    expenses_filed: float
    expenses_filed_count: int
    expenses_paid: float
    expenses_paid_count: int
    expenses_pending_count: int
    net_cash: float


class PeriodGoal(BaseModel):
    target: float
    attained: float
    attainment_pct: float
    remaining: float
    status: str
    source: str


class ProductPerformance(BaseModel):
    product_id: str | None = None
    package_id: str | None = None
    product_name: str
    package_name: str
    amount: float
    clients: int
    payments: int


class StaffPerformance(BaseModel):
    phone: str
    name: str
    role: str = ""
    sales: float = 0.0
    clients: int = 0
    collected: float = 0.0
    payment_clients: int = 0


class AtRiskClient(BaseModel):
    consultation_id: UUID
    client_name: str
    phone: str | None = None
    branch_id: UUID | None = None
    branch_name: str = "—"
    balance: float
    last_payment_date: date | None = None
    days_since_payment: int
    consultation_date: date | None = None


class PeriodReportResponse(BaseModel):
    period: str
    period_label: str
    period_start: date
    period_end: date
    generated_at: datetime
    branch_ids: list[UUID] = []
    totals: PeriodTotals
    goal: PeriodGoal
    best_selling_products: list[ProductPerformance] = []
    top_performers: list[StaffPerformance] = []
    at_risk_clients: list[AtRiskClient] = []
    at_risk_total: int = 0
    risk_days: int = 14
