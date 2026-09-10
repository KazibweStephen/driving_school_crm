import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field


class EndOfDaySummary(BaseModel):
    """System-computed figures for a branch on a given day (preview)."""
    opening_cash: float = 0
    cash_from_new_sales: float = 0
    cash_from_collections: float = 0
    cash_expenses: float = 0
    cash_in: float = 0
    cash_out: float = 0
    net_cash: float = 0
    expected_cash_at_hand: float = 0
    system_consultations_count: int = 0
    system_new_clients_count: int = 0


class EndOfDayReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    branch_id: uuid.UUID
    branch_name: str | None = None
    report_date: date
    cash_at_hand: Decimal
    total_expenses: Decimal = Decimal("0")
    consultations_count: int
    new_clients_count: int
    notes: str | None = None
    opening_cash: Decimal = Decimal("0")
    cash_from_new_sales: Decimal = Decimal("0")
    cash_from_collections: Decimal = Decimal("0")
    cash_expenses: Decimal = Decimal("0")
    cash_in: Decimal = Decimal("0")
    cash_out: Decimal = Decimal("0")
    net_cash: Decimal = Decimal("0")
    expected_cash_at_hand: Decimal = Decimal("0")
    variation: Decimal = Decimal("0")
    expense_variation: Decimal = Decimal("0")
    status: str = "matched"
    created_by_phone: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @property
    def matched(self) -> bool:
        return self.status == "matched"

    @property
    def variation_value(self) -> float:
        return float(self.variation)

    @property
    def cash_matched(self) -> bool:
        """Entered cash reconciles against the expected figure."""
        return abs(self.variation) < Decimal("0.005")

    @property
    def expense_matched(self) -> bool:
        """Entered total expenses reconcile against the system's paid expenses."""
        return abs(self.expense_variation) < Decimal("0.005")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def reasons(self) -> list[str]:
        """Which entered figures did not reconcile (list of 'cash' / 'expenses')."""
        reasons: list[str] = []
        if not self.cash_matched:
            reasons.append("cash")
        if not self.expense_matched:
            reasons.append("expenses")
        return reasons


class EndOfDayReportCreate(BaseModel):
    branch_id: uuid.UUID
    report_date: date
    cash_at_hand: float = Field(..., ge=0)
    total_expenses: float | None = Field(None, ge=0)
    consultations_count: int = Field(0, ge=0)
    new_clients_count: int = Field(0, ge=0)
    notes: str | None = None


class EndOfDayRead(BaseModel):
    """GET /finance/end-of-day response: computed summary + saved report."""
    branch_id: uuid.UUID
    branch_name: str | None = None
    report_date: date
    summary: EndOfDaySummary
    report: EndOfDayReportRead | None = None