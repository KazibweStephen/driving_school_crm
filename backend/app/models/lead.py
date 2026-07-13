import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    LOST = "lost"


class Lead(Base):
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    submitted_by_id = Column(String(20), ForeignKey("users.phone"), nullable=False, index=True)
    client_name = Column(String(200), nullable=False)
    client_phone = Column(String(20), nullable=False)
    location = Column(String(300), nullable=True)
    interested_product = Column(String(300), nullable=True)
    status = Column(Enum(LeadStatus, values_callable=lambda obj: [e.value for e in obj]), default=LeadStatus.NEW)
    admin_notes = Column(Text, nullable=True)
    converted_consultation_id = Column(UUID(as_uuid=True), ForeignKey("consultations.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", backref="leads")
    submitted_by = relationship("User", backref="submitted_leads")
    converted_consultation = relationship("Consultation", backref="lead_source")
