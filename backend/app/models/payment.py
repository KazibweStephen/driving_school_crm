import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InstallmentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class NotificationChannel(str, enum.Enum):
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    SMS = "sms"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_phone: Mapped[str | None] = mapped_column(
        String(20), ForeignKey("users.phone", ondelete="SET NULL"), nullable=True, index=True
    )
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    package_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, server_default="0.00")
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, server_default="0.00")
    document_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system_receipt_number: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    consultation: Mapped["Consultation"] = relationship("Consultation", backref="payments")
    created_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_phone], uselist=False)
    installments: Mapped[list["Installment"]] = relationship(
        "Installment", back_populates="payment", cascade="all, delete-orphan"
    )


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[InstallmentStatus] = mapped_column(
        Enum(InstallmentStatus, values_callable=lambda x: [e.value for e in x]), default=InstallmentStatus.PENDING, nullable=False
    )
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    payment: Mapped["Payment"] = relationship("Payment", back_populates="installments")


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    recipient: Mapped[str] = mapped_column(String(200), nullable=False)
    opt_in: Mapped[bool] = mapped_column(default=False, nullable=False)
    reminders_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    consultation: Mapped["Consultation"] = relationship("Consultation", backref="notification_preferences")
