from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from typing import Optional


class CommissionRateCreate(BaseModel):
    package_ids: list[UUID]
    total_amount: Decimal
    converter_pct: Decimal
    primary_recommender_pct: Decimal = 0
    secondary_recommender_pct: Decimal = 0
    active_from: date
    active_until: Optional[date] = None
    notes: Optional[str] = None


class CommissionRateUpdate(BaseModel):
    package_ids: Optional[list[UUID]] = None
    total_amount: Optional[Decimal] = None
    converter_pct: Optional[Decimal] = None
    primary_recommender_pct: Optional[Decimal] = None
    secondary_recommender_pct: Optional[Decimal] = None
    active_from: Optional[date] = None
    active_until: Optional[date] = None
    notes: Optional[str] = None


class CommissionRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    package_ids: list[UUID] = []
    total_amount: Decimal
    converter_pct: Decimal
    primary_recommender_pct: Decimal
    secondary_recommender_pct: Decimal
    active_from: date
    active_until: Optional[date] = None
    deactivated_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    package_names: list[str] = []


class CommissionMaturity(BaseModel):
    maturity_pct: Decimal
    matured_converter_amount: Decimal
    matured_primary_amount: Decimal
    matured_secondary_amount: Decimal
    remaining_converter_amount: Decimal
    remaining_primary_amount: Decimal
    remaining_secondary_amount: Decimal


class CommissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    cart_item_id: UUID
    commission_rate_id: Optional[UUID] = None
    converter_id: str
    primary_recommender_id: Optional[str] = None
    secondary_recommender_id: Optional[str] = None
    total_amount: Decimal
    converter_amount: Decimal
    primary_recommender_amount: Decimal
    secondary_recommender_amount: Decimal
    status: str
    contest_status: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    maturity: Optional[CommissionMaturity] = None
    converter_name: Optional[str] = None
    primary_recommender_name: Optional[str] = None
    secondary_recommender_name: Optional[str] = None
    client_name: Optional[str] = None
    package_name: Optional[str] = None


class CommissionListResponse(BaseModel):
    items: list[CommissionRead]
    total: int
    page: int
    page_size: int


class ContestCreate(BaseModel):
    reason: str


class ContestResolve(BaseModel):
    resolution: str
    new_primary_recommender_id: Optional[str] = None
    new_secondary_recommender_id: Optional[str] = None
    new_converter_pct: Optional[Decimal] = None
    new_primary_pct: Optional[Decimal] = None
    new_secondary_pct: Optional[Decimal] = None


class ContestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    commission_id: UUID
    contested_by_id: str
    reason: str
    status: str
    resolution: Optional[str] = None
    resolved_by_id: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    contested_by_name: Optional[str] = None
    resolved_by_name: Optional[str] = None


class CommissionSummaryItem(BaseModel):
    commission_id: UUID
    client_name: str
    package_name: str
    total_amount: Decimal
    converter_amount: Decimal
    primary_recommender_amount: Decimal
    secondary_recommender_amount: Decimal
    maturity_pct: Decimal
    matured_amount: Decimal
    remaining_amount: Decimal
    user_role: str
    user_share_total: Decimal
    user_share_matured: Decimal
    user_share_remaining: Decimal


class CommissionSummaryResponse(BaseModel):
    items: list[CommissionSummaryItem]
    total_commission: Decimal
    total_matured: Decimal
    total_remaining: Decimal
