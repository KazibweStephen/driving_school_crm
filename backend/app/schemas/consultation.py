import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.consultation import ConsultationStatus, FollowUpStatus, FollowUpType, InterestLevel
from app.schemas.cart import CartItemRead
from app.schemas.payment import InstallmentCreate


class InterestedProduct(BaseModel):
    product_id: str | None = None
    product_name: str | None = None
    package_id: str | None = None
    package_name: str | None = None
    status: str | None = None


class FollowUpCreate(BaseModel):
    follow_up_date: date
    note: str | None = None
    type: FollowUpType = FollowUpType.CONVERSION
    cart_item_ids: list[uuid.UUID] | None = None


class FollowUpUpdate(BaseModel):
    follow_up_date: date | None = None
    note: str | None = None
    status: FollowUpStatus | None = None
    type: FollowUpType | None = None
    cart_item_ids: list[uuid.UUID] | None = None


class FollowUpRead(BaseModel):
    id: uuid.UUID
    consultation_id: uuid.UUID
    follow_up_date: date
    note: str | None
    status: FollowUpStatus
    type: FollowUpType
    cart_item_ids: list[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_cart(cls, fu) -> "FollowUpRead":
        return cls(
            id=fu.id,
            consultation_id=fu.consultation_id,
            follow_up_date=fu.follow_up_date,
            note=fu.note,
            status=fu.status,
            type=fu.type,
            cart_item_ids=[ci.id for ci in fu.cart_items] if fu.cart_items else [],
            created_at=fu.created_at,
            updated_at=fu.updated_at,
        )


class ConsultationCreate(BaseModel):
    phone: str = Field(..., min_length=5, max_length=20)
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    how_they_knew_us: str | None = None
    interest_level: InterestLevel | None = None
    interested_products: list[InterestedProduct] | None = None
    start_date: date | None = None
    notes: str | None = None
    branch_id: uuid.UUID | None = None


class ConsultationUpdate(BaseModel):
    phone: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    how_they_knew_us: str | None = None
    interest_level: InterestLevel | None = None
    interested_products: list[InterestedProduct] | None = None
    start_date: date | None = None
    notes: str | None = None
    status: ConsultationStatus | None = None
    branch_id: uuid.UUID | None = None


class ConsultationRead(BaseModel):
    id: uuid.UUID
    phone: str
    first_name: str
    middle_name: str | None
    last_name: str | None
    location: str | None
    how_they_knew_us: str | None
    interest_level: InterestLevel | None
    interested_products: list[InterestedProduct] | None
    start_date: date | None
    notes: str | None
    status: ConsultationStatus
    branch_id: uuid.UUID | None = None
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime
    follow_ups: list[FollowUpRead]
    cart_items: list[CartItemRead] | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_cart(cls, c) -> "ConsultationRead":
        return cls(
            id=c.id,
            phone=c.phone,
            first_name=c.first_name,
            middle_name=c.middle_name,
            last_name=c.last_name,
            location=c.location,
            how_they_knew_us=c.how_they_knew_us,
            interest_level=c.interest_level,
            interested_products=c.interested_products,
            start_date=c.start_date,
            notes=c.notes,
            status=c.status,
            branch_id=c.branch_id,
            created_by_phone=c.created_by_phone,
            created_at=c.created_at,
            updated_at=c.updated_at,
            follow_ups=[FollowUpRead.from_orm_with_cart(fu) for fu in c.follow_ups],
            cart_items=[CartItemRead.model_validate(ci) for ci in c.cart_items] if c.cart_items else [],
        )


class ConsultationListParams(BaseModel):
    search: str | None = Field(None, max_length=50)
    status: ConsultationStatus | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ConsultationListResponse(BaseModel):
    consultations: list[ConsultationRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class ClientInfo(BaseModel):
    phone: str
    first_name: str
    middle_name: str | None
    last_name: str | None
    location: str | None
    how_they_knew_us: str | None
    interest_level: InterestLevel | None
    latest_status: ConsultationStatus | None
    latest_consultation_id: uuid.UUID | None


class FullConsultationItem(BaseModel):
    product_id: str
    package_id: str | None = None
    allocation: float = 0
    installments: list[InstallmentCreate] = []


class FullConsultationPayment(BaseModel):
    receipt_number: str | None = None


class FullConsultationCreate(BaseModel):
    phone: str = Field(..., min_length=5, max_length=20)
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    how_they_knew_us: str | None = None
    interest_level: InterestLevel | None = None
    start_date: date | None = None
    notes: str | None = None
    branch_id: uuid.UUID | None = None
    items: list[FullConsultationItem] = []
    payment: FullConsultationPayment | None = None
