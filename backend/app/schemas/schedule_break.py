import uuid
from datetime import datetime, time

from pydantic import BaseModel


class ScheduleBreakCreate(BaseModel):
    name: str
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    is_active: bool = True
    is_standard: bool = False


class ScheduleBreakUpdate(BaseModel):
    name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    is_active: bool | None = None
    is_standard: bool | None = None


class ScheduleBreakRead(BaseModel):
    id: uuid.UUID
    name: str
    start_time: time
    end_time: time
    is_active: bool
    is_standard: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
