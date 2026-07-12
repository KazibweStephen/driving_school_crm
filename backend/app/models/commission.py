import enum
import uuid

from sqlalchemy import Column, String, Text, Boolean, Integer, Numeric, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class CommissionStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"


class CommissionRate(Base):
    __tablename__ = "commission_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    lesson_type = Column(String(50), nullable=True)
    transmission_type = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", backref="commission_rates")


class Commission(Base):
    __tablename__ = "commissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    instructor_id = Column(String(20), ForeignKey("users.phone"), nullable=False, index=True)
    client_lesson_id = Column(UUID(as_uuid=True), ForeignKey("client_lessons.id"), nullable=True, index=True)
    training_session_id = Column(UUID(as_uuid=True), ForeignKey("training_sessions.id"), nullable=True, index=True)
    commission_rate_id = Column(UUID(as_uuid=True), ForeignKey("commission_rates.id"), nullable=True)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(Enum(CommissionStatus, values_callable=lambda obj: [e.value for e in obj]), default=CommissionStatus.PENDING)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    paid_by = Column(String(20), ForeignKey("users.phone"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", backref="commissions")
    instructor = relationship("User", foreign_keys=[instructor_id], backref="commissions")
    client_lesson = relationship("ClientLesson", backref="commissions")
    training_session = relationship("TrainingSession", backref="commissions")
    commission_rate = relationship("CommissionRate", backref="commissions")
    paid_by_user = relationship("User", foreign_keys=[paid_by], backref="paid_commissions")
