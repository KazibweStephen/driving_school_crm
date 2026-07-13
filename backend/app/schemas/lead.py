from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from typing import Optional


class LeadCreate(BaseModel):
    client_name: str
    client_phone: str
    location: Optional[str] = None
    interested_product: Optional[str] = None


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    converted_consultation_id: Optional[UUID] = None


class LeadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    submitted_by_id: str
    client_name: str
    client_phone: str
    location: Optional[str] = None
    interested_product: Optional[str] = None
    status: str
    admin_notes: Optional[str] = None
    converted_consultation_id: Optional[UUID] = None
    created_at: datetime
    submitted_by_name: Optional[str] = None
    converted_client_name: Optional[str] = None
