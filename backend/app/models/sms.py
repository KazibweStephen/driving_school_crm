import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SmsTemplateCategory(str, enum.Enum):
    PIN_CREATION_RESET = "pin_creation_reset"
    TRAINING_CANCELLATION = "training_cancellation"
    LESSON_REMINDER = "lesson_reminder"
    LESSON_SCHEDULING = "lesson_scheduling"
    BRANCH_VISIT = "branch_visit"
    PAYMENT_RECEIPT = "payment_receipt"
    PAYMENT_INSTALLMENT = "payment_installment"
    PERMIT_EXPIRING = "permit_expiring"
    GENERAL = "general"
    CUSTOM = "custom"


class SmsTrigger(str, enum.Enum):
    USER_CREATED = "user_created"
    PIN_RESET = "pin_reset"
    CONSULTATION_CREATED = "consultation_created"
    PAYMENT_RECEIVED = "payment_received"
    INSTALLMENT_DUE = "installment_due"
    INSTALLMENT_OVERDUE = "installment_overdue"
    CART_ITEM_CONVERTED = "cart_item_converted"
    EXPENSE_APPROVED = "expense_approved"
    LESSON_SCHEDULED = "lesson_scheduled"
    LESSON_CANCELLED = "lesson_cancelled"
    LESSON_REMINDER = "lesson_reminder"
    TRAINING_COMPLETED = "training_completed"
    PERMIT_EXPIRING = "permit_expiring"
    MANUAL = "manual"


_values_callable = lambda x: [e.value for e in x]


class SmsTemplate(Base):
    __tablename__ = "sms_templates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[SmsTemplateCategory] = mapped_column(
        Enum(SmsTemplateCategory, values_callable=_values_callable),
        nullable=False,
    )
    trigger_event: Mapped[SmsTrigger] = mapped_column(
        Enum(SmsTrigger, values_callable=_values_callable),
        nullable=False,
        default=SmsTrigger.MANUAL,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    company: Mapped["Company"] = relationship("Company", back_populates="sms_templates")


class SmsLog(Base):
    __tablename__ = "sms_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    message_length: Mapped[int] = mapped_column(nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="logging")
    trigger_event: Mapped[str | None] = mapped_column(String(50), nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("sms_templates.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    sms_units: Mapped[int] = mapped_column(nullable=False, default=1)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
