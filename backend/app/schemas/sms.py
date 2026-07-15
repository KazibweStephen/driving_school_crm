import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Company SMS Settings ──

SMS_TRIGGERS = [
    {"label": "Manual (No auto-trigger)", "value": "manual"},
    {"label": "User Created (sends PIN)", "value": "user_created"},
    {"label": "PIN Reset", "value": "pin_reset"},
    {"label": "Consultation Created", "value": "consultation_created"},
    {"label": "Payment Received", "value": "payment_received"},
    {"label": "Installment Due (reminder)", "value": "installment_due"},
    {"label": "Installment Overdue (dunning)", "value": "installment_overdue"},
    {"label": "Cart Item Converted", "value": "cart_item_converted"},
    {"label": "Expense Approved", "value": "expense_approved"},
    {"label": "Lesson Scheduled", "value": "lesson_scheduled"},
    {"label": "Lesson Cancelled", "value": "lesson_cancelled"},
    {"label": "Lesson Reminder", "value": "lesson_reminder"},
    {"label": "Training Completed", "value": "training_completed"},
    {"label": "Permit Expiring", "value": "permit_expiring"},
]

# Trigger → Category mapping (for auto-seeding defaults)
TRIGGER_CATEGORY_MAP = {
    "user_created": "pin_creation_reset",
    "pin_reset": "pin_creation_reset",
    "consultation_created": "branch_visit",
    "payment_received": "payment_receipt",
    "installment_due": "payment_installment",
    "installment_overdue": "payment_installment",
    "cart_item_converted": "payment_receipt",
    "expense_approved": "general",
    "lesson_scheduled": "lesson_scheduling",
    "lesson_cancelled": "training_cancellation",
    "lesson_reminder": "lesson_reminder",
    "training_completed": "general",
    "permit_expiring": "permit_expiring",
    "manual": "custom",
}

# Default template bodies per trigger
DEFAULT_TEMPLATES = {
    "user_created": {
        "name": "PIN Creation",
        "category": "pin_creation_reset",
        "body": "Dear {name},\n\nYour account has been created. Your PIN is: {pin}\nPlease keep it safe.\n\nDrive Safe!",
    },
    "pin_reset": {
        "name": "PIN Reset",
        "category": "pin_creation_reset",
        "body": "Dear {name},\n\nYour PIN has been reset. Your new PIN is: {pin}\nPlease keep it safe.\n\nDrive Safe!",
    },
    "consultation_created": {
        "name": "Welcome Message",
        "category": "branch_visit",
        "body": "Welcome to Driving School, {name}!\n\nWe're excited to have you on board.\nWe'll be in touch shortly.\n\nDrive Safe!",
    },
    "payment_received": {
        "name": "Payment Receipt",
        "category": "payment_receipt",
        "body": "Dear {name},\n\nThank you for your payment of {amount}.\nReceipt: {receipt_number}\n\n{download_url}\n\nDrive Safe!",
    },
    "installment_due": {
        "name": "Installment Reminder",
        "category": "payment_installment",
        "body": "Dear {name},\n\nReminder: Installment of {amount} is due on {due_date}.\nOutstanding balance: {balance}\n\nPlease make payment to avoid interruption.\nThank you!",
    },
    "installment_overdue": {
        "name": "Overdue Payment Notice",
        "category": "payment_installment",
        "body": "Dear {name},\n\nFriendly reminder: Your payment of {overdue_amount} is {days_overdue} day(s) overdue.\nTotal outstanding: {total_balance}\n\nPlease clear the balance to continue your training.\nContact us for payment options.",
    },
    "expense_approved": {
        "name": "Expense Approved",
        "category": "general",
        "body": "Dear {name},\n\nYour expense request '{description}' for {amount} has been approved.\nFinance will process the payment shortly.\n\nThank you.",
    },
    "lesson_scheduled": {
        "name": "Lesson Scheduled",
        "category": "lesson_scheduling",
        "body": "Dear {name},\n\nYour lesson has been scheduled.\nDate: {date}\nTime: {time}\nInstructor: {instructor}\n\nPlease be on time.",
    },
    "lesson_cancelled": {
        "name": "Lesson Cancelled",
        "category": "training_cancellation",
        "body": "Dear {name},\n\nYour lesson on {date} at {time} has been cancelled.\nReason: {reason}\n\nWe'll reschedule shortly.",
    },
    "lesson_reminder": {
        "name": "Lesson Reminder",
        "category": "lesson_reminder",
        "body": "Dear {name},\n\nReminder: You have a lesson tomorrow.\nDate: {date}\nTime: {time}\nInstructor: {instructor}\n\nSee you there!",
    },
    "permit_expiring": {
        "name": "Permit Expiring Soon",
        "category": "permit_expiring",
        "body": "Dear {name},\n\nYour permit is expiring on {expiry_date} ({days_remaining} days remaining).\nPlease renew to avoid interruption.\n\nDrive Safe!",
    },
    "cart_item_converted": {
        "name": "Conversion Notification",
        "category": "general",
        "body": "Dear {name},\n\nCongratulations! Your registration is complete.\nPackage: {package}\nAmount: {amount}\n\nWe'll contact you shortly to schedule your first lesson.\n\nDrive Safe!",
    },
    "training_completed": {
        "name": "Training Completed",
        "category": "general",
        "body": "Dear {name},\n\nCongratulations! You have completed your {package} training.\nTotal sessions: {total_sessions}\n\nPlease contact us for your next steps.\n\nDrive Safe!",
    },
}


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
    rate_per_sms: float | None = None


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
    rate_per_sms: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── SMS Templates ──

class SmsTemplateCreate(BaseModel):
    name: str = Field(..., max_length=100)
    category: str
    trigger_event: str = "manual"
    body: str
    is_active: bool = True


class SmsTemplateUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    trigger_event: str | None = None
    body: str | None = None
    is_active: bool | None = None


class SmsTemplateRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    category: str
    trigger_event: str
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


# ── SMS Logs ──

class SmsLogRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    phone: str
    message: str
    message_length: int
    provider: str
    trigger_event: str | None
    template_id: uuid.UUID | None
    status: str
    error_message: str | None
    provider_response: str | None
    sms_units: int
    cost: float
    sent_at: datetime

    model_config = {"from_attributes": True}


class SmsLogListResponse(BaseModel):
    logs: list[SmsLogRead]
    total: int
    total_units: int
    total_cost: float
