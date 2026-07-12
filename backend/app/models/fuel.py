import uuid

from sqlalchemy import Column, String, Text, Boolean, Integer, Numeric, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class FuelRate(Base):
    __tablename__ = "fuel_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True)
    rate_per_lesson = Column(Numeric(10, 2), nullable=False)
    is_active = Column(Boolean, default=True)
    effective_from = Column(Date, server_default=func.current_date())
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", backref="fuel_rates")
    vehicle = relationship("Vehicle", backref="fuel_rates")


class FuelRefueling(Base):
    __tablename__ = "fuel_refuelings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True)
    fuel_rate_id = Column(UUID(as_uuid=True), ForeignKey("fuel_rates.id"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    liters = Column(Numeric(10, 2), nullable=True)
    lessons_covered = Column(Integer, nullable=False)
    refueled_at = Column(DateTime(timezone=True), server_default=func.now())
    odometer_reading = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", backref="fuel_refuelings")
    vehicle = relationship("Vehicle", backref="fuel_refuelings")
    fuel_rate = relationship("FuelRate", backref="fuel_refuelings")
