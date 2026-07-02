import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

_values_callable = lambda x: [e.value for e in x]


class InterestLevel(str, enum.Enum):
    VERY_HIGH = "very_high"
    HIGH = "high"
    MEDIUM = "medium"
    UNDECIDED = "undecided"
    LOW = "low"


class ConsultationStatus(str, enum.Enum):
    NEW = "new"
    CONSULTING = "consulting"
    ACTIVE = "active"
    CONVERTED_NEW = "converted_new"
    CONVERTED_UPSOLD = "converted_upsold"
    CONVERTED_COMPLETED = "converted_completed"
    LOST = "lost"


class FollowUpStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class FollowUpType(str, enum.Enum):
    CONVERSION = "conversion"
    PAYMENT = "payment"


class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    how_they_knew_us: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interest_level: Mapped[InterestLevel | None] = mapped_column(
        Enum(InterestLevel, values_callable=_values_callable), nullable=True
    )
    interested_products: Mapped[list | None] = mapped_column(JSON, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ConsultationStatus] = mapped_column(
        Enum(ConsultationStatus, values_callable=_values_callable), default=ConsultationStatus.NEW, nullable=False
    )
    created_by_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    follow_ups: Mapped[list["FollowUp"]] = relationship(
        "FollowUp", back_populates="consultation", cascade="all, delete-orphan"
    )
    cart_items: Mapped[list["CartItem"]] = relationship(
        "CartItem", back_populates="consultation", cascade="all, delete-orphan"
    )


class FollowUp(Base):
    __tablename__ = "follow_ups"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False
    )
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[FollowUpStatus] = mapped_column(
        Enum(FollowUpStatus, values_callable=_values_callable), default=FollowUpStatus.PENDING, nullable=False
    )
    type: Mapped[FollowUpType] = mapped_column(
        Enum(FollowUpType, values_callable=_values_callable), default=FollowUpType.CONVERSION, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    consultation: Mapped["Consultation"] = relationship("Consultation", back_populates="follow_ups")
    cart_items: Mapped[list["CartItem"]] = relationship(
        "CartItem", secondary="follow_up_cart_items", back_populates="follow_ups"
    )
