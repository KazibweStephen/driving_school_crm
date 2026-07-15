import enum
import uuid
from datetime import datetime, date

from sqlalchemy import Column, String, Text, Boolean, Integer, Numeric, DateTime, Date, Enum, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class CommissionStatus(str, enum.Enum):
    PENDING = "pending"
    PARTIALLY_MATURED = "partially_matured"
    FULLY_MATURED = "fully_matured"


class ContestStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


commission_rate_packages = Table(
    "commission_rate_packages", Base.metadata,
    Column("commission_rate_id", UUID(as_uuid=True), ForeignKey("commission_rates.id", ondelete="CASCADE"), primary_key=True),
    Column("package_id", UUID(as_uuid=True), ForeignKey("packages.id", ondelete="CASCADE"), primary_key=True),
)


class CommissionRate(Base):
    __tablename__ = "commission_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    total_amount = Column(Numeric(10, 2), nullable=False)
    converter_pct = Column(Numeric(5, 2), nullable=False)
    primary_recommender_pct = Column(Numeric(5, 2), nullable=False, default=0)
    secondary_recommender_pct = Column(Numeric(5, 2), nullable=False, default=0)
    active_from = Column(Date, nullable=False)
    active_until = Column(Date, nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", backref="commission_rates")
    packages = relationship("Package", secondary=commission_rate_packages, backref="commission_rates")


class Commission(Base):
    __tablename__ = "commissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    cart_item_id = Column(UUID(as_uuid=True), ForeignKey("cart_items.id"), nullable=False, index=True)
    commission_rate_id = Column(UUID(as_uuid=True), ForeignKey("commission_rates.id"), nullable=True)
    converter_id = Column(String(20), ForeignKey("users.phone"), nullable=True, index=True)
    primary_recommender_id = Column(String(20), ForeignKey("users.phone"), nullable=True, index=True)
    secondary_recommender_id = Column(String(20), ForeignKey("users.phone"), nullable=True, index=True)
    total_amount = Column(Numeric(10, 2), nullable=False)
    converter_amount = Column(Numeric(10, 2), nullable=False, default=0)
    primary_recommender_amount = Column(Numeric(10, 2), nullable=False, default=0)
    secondary_recommender_amount = Column(Numeric(10, 2), nullable=False, default=0)
    status = Column(Enum(CommissionStatus, values_callable=lambda obj: [e.value for e in obj]), default=CommissionStatus.PENDING)
    contest_status = Column(Enum(ContestStatus, values_callable=lambda obj: [e.value for e in obj]), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", backref="commissions_new")
    cart_item = relationship("CartItem", backref="commissions")
    commission_rate = relationship("CommissionRate", backref="commissions")
    converter = relationship("User", foreign_keys=[converter_id], backref="converted_commissions")
    primary_recommender = relationship("User", foreign_keys=[primary_recommender_id], backref="primary_recommended_commissions")
    secondary_recommender = relationship("User", foreign_keys=[secondary_recommender_id], backref="secondary_recommended_commissions")


class CommissionContest(Base):
    __tablename__ = "commission_contests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commission_id = Column(UUID(as_uuid=True), ForeignKey("commissions.id"), nullable=False, index=True)
    contested_by_id = Column(String(20), ForeignKey("users.phone"), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    status = Column(Enum(ContestStatus, values_callable=lambda obj: [e.value for e in obj]), default=ContestStatus.OPEN)
    resolution = Column(Text, nullable=True)
    resolved_by_id = Column(String(20), ForeignKey("users.phone"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    commission = relationship("Commission", backref="contests")
    contested_by = relationship("User", foreign_keys=[contested_by_id], backref="submitted_contests")
    resolved_by = relationship("User", foreign_keys=[resolved_by_id], backref="resolved_contests")
