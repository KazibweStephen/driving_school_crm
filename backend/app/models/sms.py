import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
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
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    company: Mapped["Company"] = relationship("Company", back_populates="sms_templates")
