import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

_values_callable = lambda x: [e.value for e in x]


class CartItemStatus(str, enum.Enum):
    INTERESTED = "interested"
    CONSULTING = "consulting"
    CONVERTED = "converted"
    CONVERTED_PAID = "converted_paid"
    CONVERTED_PAYING = "converted_paying"
    LOST = "lost"


class FollowUpType(str, enum.Enum):
    CONVERSION = "conversion"
    PAYMENT = "payment"


follow_up_cart_items = Table(
    "follow_up_cart_items",
    Base.metadata,
    Column("follow_up_id", Uuid, ForeignKey("follow_ups.id", ondelete="CASCADE"), primary_key=True),
    Column("cart_item_id", Uuid, ForeignKey("cart_items.id", ondelete="CASCADE"), primary_key=True),
)


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    package_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[CartItemStatus] = mapped_column(
        Enum(CartItemStatus, values_callable=_values_callable),
        default=CartItemStatus.INTERESTED,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_important: Mapped[bool] = mapped_column(default=False, server_default='f', nullable=False)
    recovery_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Training/permit fields inherited from Package at creation
    requires_driving_training: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_theory_training: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_permit_processing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    driving_training_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    theory_training_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    permit_processing_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    consultation: Mapped["Consultation"] = relationship("Consultation", back_populates="cart_items")
    follow_ups: Mapped[list["FollowUp"]] = relationship(
        "FollowUp", secondary=follow_up_cart_items, back_populates="cart_items"
    )
    training_sessions: Mapped[list["TrainingSession"]] = relationship(
        "TrainingSession", back_populates="cart_item", cascade="all, delete-orphan"
    )
    permit_progress: Mapped["PermitProgress | None"] = relationship(
        "PermitProgress", back_populates="cart_item", uselist=False, cascade="all, delete-orphan"
    )
