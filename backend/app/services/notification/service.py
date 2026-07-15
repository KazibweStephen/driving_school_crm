import logging
import math
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Branch, Company, CompanySmsSettings, Expense, ExpenseStatus
from app.models.sms import SmsLog
from app.services.notification.providers import (
    LoggingProvider,
    get_provider,
)

logger = logging.getLogger(__name__)


class NotificationChannel(str, Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"


async def _get_provider_for_company(db: AsyncSession, company_id):
    """Look up company SMS settings and return the appropriate provider."""
    result = await db.execute(
        select(CompanySmsSettings).where(CompanySmsSettings.company_id == company_id)
    )
    settings = result.scalar_one_or_none()

    if not settings or not settings.is_active:
        logger.info("[SMS] SMS disabled or not configured for company %s, logging only", company_id)
        return LoggingProvider()

    logger.info("[SMS] Using provider '%s' for company %s", settings.provider, company_id)
    return get_provider(
        settings.provider,
        egosms_api_url=settings.egosms_api_url,
        egosms_username=settings.egosms_username,
        egosms_password=settings.egosms_password,
        egosms_sender=settings.egosms_sender,
        twilio_account_sid=settings.twilio_account_sid,
        twilio_auth_token=settings.twilio_auth_token,
        twilio_phone_number=settings.twilio_phone_number,
    )


def _normalize_phone(phone: str, currency: str) -> str:
    """Normalize phone number based on company currency/country."""
    if currency == "UGX" and phone.startswith("0"):
        return "256" + phone[1:]
    return phone


SMS_CHARS_PER_UNIT = 160


async def send_sms(
    db: AsyncSession,
    company_id,
    phone: str,
    message: str,
    *,
    trigger_event: str | None = None,
    template_id=None,
) -> bool:
    """Send an SMS using the company's configured provider and log it."""
    currency = "UGX"
    provider_name = "logging"
    rate_per_sms = 0.0
    if company_id:
        company = await db.get(Company, company_id)
        if company:
            currency = company.currency
        settings_result = await db.execute(
            select(CompanySmsSettings).where(CompanySmsSettings.company_id == company_id)
        )
        sms_settings = settings_result.scalar_one_or_none()
        if sms_settings:
            rate_per_sms = sms_settings.rate_per_sms or 0.0
    phone = _normalize_phone(phone, currency)

    provider = await _get_provider_for_company(db, company_id)
    if not isinstance(provider, LoggingProvider):
        provider_name = type(provider).__name__

    result = await provider.send(phone, message)

    message_length = len(message)
    sms_units = math.ceil(message_length / SMS_CHARS_PER_UNIT) if message_length > 0 else 1
    cost = round(sms_units * rate_per_sms, 2)

    log = SmsLog(
        company_id=company_id,
        phone=phone,
        message=message,
        message_length=message_length,
        provider=provider_name,
        trigger_event=trigger_event,
        template_id=template_id,
        status="sent" if result.success else "failed",
        error_message=None if result.success else result.response,
        provider_response=result.response,
        sms_units=sms_units,
        cost=cost,
    )
    db.add(log)

    if result.success and cost > 0 and company_id:
        branch_result = await db.execute(
            select(Branch.id).where(Branch.company_id == company_id, Branch.is_active == True).limit(1)
        )
        branch_row = branch_result.first()
        if branch_row:
            expense = Expense(
                branch_id=branch_row[0],
                amount=cost,
                description=f"SMS: {sms_units} unit(s) to {phone} ({trigger_event or 'manual'})",
                category="SMS",
                status=ExpenseStatus.PENDING,
            )
            db.add(expense)

    await db.flush()
    return result.success


async def send_template_sms(
    db: AsyncSession,
    company_id,
    phone: str,
    category: str,
    variables: dict[str, str],
    *,
    trigger_event: str | None = None,
) -> bool:
    """Look up the active template for a trigger/category, render variables, and send."""
    from app.services.sms import resolve_template, render_template

    template = await resolve_template(db, company_id, category, trigger_event=trigger_event)
    if not template:
        logger.warning(
            "[SMS] No active template for trigger=%s category=%s company=%s, skipping",
            trigger_event, category, company_id,
        )
        return False
    message = render_template(template.body, variables)
    return await send_sms(
        db, company_id, phone, message,
        trigger_event=trigger_event or category,
        template_id=template.id,
    )


# ── Event-driven SMS helpers ──


async def on_user_created(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    pin: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "pin_creation_reset",
        {"name": name, "pin": pin},
        trigger_event="user_created",
    )


async def on_pin_reset(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    pin: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "pin_creation_reset",
        {"name": name, "pin": pin},
        trigger_event="pin_reset",
    )


async def on_consultation_created(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "branch_visit",
        {"name": name},
        trigger_event="consultation_created",
    )


async def on_payment_received(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    amount: str,
    receipt_number: str,
    download_url: str = "",
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "payment_receipt",
        {"name": name, "amount": amount, "receipt_number": receipt_number, "download_url": download_url},
        trigger_event="payment_received",
    )


async def on_installment_due(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    amount: str,
    due_date: str,
    balance: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "payment_installment",
        {"name": name, "amount": amount, "due_date": due_date, "balance": balance},
        trigger_event="installment_due",
    )


async def on_installment_overdue(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    overdue_amount: str,
    days_overdue: int,
    total_balance: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "payment_installment",
        {"name": name, "overdue_amount": overdue_amount, "days_overdue": str(days_overdue), "total_balance": total_balance},
        trigger_event="installment_overdue",
    )


async def on_expense_approved(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    description: str,
    amount: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "general",
        {"name": name, "description": description, "amount": amount},
        trigger_event="expense_approved",
    )


async def on_lesson_scheduled(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    date: str,
    time: str,
    instructor: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "lesson_scheduling",
        {"name": name, "date": date, "time": time, "instructor": instructor},
        trigger_event="lesson_scheduled",
    )


async def on_lesson_cancelled(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    date: str,
    time: str,
    reason: str = "",
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "training_cancellation",
        {"name": name, "date": date, "time": time, "reason": reason},
        trigger_event="lesson_cancelled",
    )


async def on_lesson_reminder(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    date: str,
    time: str,
    instructor: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "lesson_reminder",
        {"name": name, "date": date, "time": time, "instructor": instructor},
        trigger_event="lesson_reminder",
    )


async def on_permit_expiring(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    expiry_date: str,
    days_remaining: int,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "permit_expiring",
        {"name": name, "expiry_date": expiry_date, "days_remaining": str(days_remaining)},
        trigger_event="permit_expiring",
    )


async def on_cart_item_converted(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    package_name: str,
    amount: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "general",
        {"name": name, "package": package_name, "amount": amount},
        trigger_event="cart_item_converted",
    )


async def on_training_completed(
    db: AsyncSession,
    company_id,
    phone: str,
    name: str,
    training_type: str,
    lesson_number: str,
) -> bool:
    return await send_template_sms(
        db, company_id, phone, "training_completed",
        {"name": name, "training_type": training_type, "lesson_number": lesson_number},
        trigger_event="training_completed",
    )
