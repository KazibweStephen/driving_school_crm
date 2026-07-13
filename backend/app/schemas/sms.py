import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Company SMS Settings ──

class CompanySmsSettingsUpdate(BaseModel):
    is_active: bool | None = None
    provider: str | None = Field(None, pattern="^(logging|egosms|twilio)$")
    egosms_api_url: str | None = None
    egosms_username: str | None = None
    egosms_password: str | None = None
    egosms_sender: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_phone_number: str | None = None


class CompanySmsSettingsRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    is_active: bool
    provider: str
    egosms_api_url: str
    egosms_username: str
    egosms_sender: str
    twilio_account_sid: str
    twilio_phone_number: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── SMS Templates ──

class SmsTemplateCreate(BaseModel):
    name: str = Field(..., max_length=100)
    category: str
    body: str
    is_active: bool = True


class SmsTemplateUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    body: str | None = None
    is_active: bool | None = None


class SmsTemplateRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    category: str
    body: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Test SMS ──

class TestSmsRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)


# ── Send SMS ──

class SendSmsRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    message: str


class SendTemplateSmsRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    category: str
    variables: dict[str, str] = {}
