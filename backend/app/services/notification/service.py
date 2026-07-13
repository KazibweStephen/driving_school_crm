import logging
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanySmsSettings
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
        return LoggingProvider()

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


async def send_sms(
    db: AsyncSession,
    company_id,
    phone: str,
    message: str,
) -> bool:
    """Send an SMS using the company's configured provider."""
    provider = await _get_provider_for_company(db, company_id)
    return await provider.send(phone, message)


async def send_template_sms(
    db: AsyncSession,
    company_id,
    phone: str,
    category: str,
    variables: dict[str, str],
) -> bool:
    """Look up the active template for a category, render variables, and send."""
    from app.services.sms import resolve_template, render_template

    template = await resolve_template(db, company_id, category)
    if not template:
        logger.warning(
            "[SMS] No active template for category=%s company=%s, skipping",
            category, company_id,
        )
        return False
    message = render_template(template.body, variables)
    return await send_sms(db, company_id, phone, message)


# ── Pre-built message helpers (backward-compatible) ──


async def send_payment_receipt(
    phone: str,
    client_name: str,
    receipt_number: str,
    amount: str,
    download_url: str,
    *,
    db: AsyncSession | None = None,
    company_id=None,
) -> bool:
    msg = (
        f"Dear {client_name},\n\n"
        f"Thank you for your payment of UGX {amount}.\n"
        f"Receipt: {receipt_number}\n\n"
        f"Download receipt: {download_url}\n\n"
        f"Drive Safe!"
    )
    if db and company_id:
        return await send_sms(db, company_id, phone, msg)
    logger.info("[SMS] To=%s | %s", phone, msg)
    return True


async def send_installment_reminder(
    phone: str,
    client_name: str,
    due_date: str,
    amount: str,
    balance: str,
    *,
    db: AsyncSession | None = None,
    company_id=None,
) -> bool:
    msg = (
        f"Dear {client_name},\n\n"
        f"Reminder: Installment of UGX {amount} is due on {due_date}.\n"
        f"Outstanding balance: UGX {balance}\n\n"
        f"Please make payment to avoid interruption of lessons.\n"
        f"Thank you!"
    )
    if db and company_id:
        return await send_sms(db, company_id, phone, msg)
    logger.info("[SMS] To=%s | %s", phone, msg)
    return True


async def send_dunning_notice(
    phone: str,
    client_name: str,
    overdue_amount: str,
    days_overdue: int,
    total_balance: str,
    *,
    db: AsyncSession | None = None,
    company_id=None,
) -> bool:
    msg = (
        f"Dear {client_name},\n\n"
        f"Friendly reminder: Your payment of UGX {overdue_amount} "
        f"is {days_overdue} day(s) overdue.\n"
        f"Total outstanding: UGX {total_balance}\n\n"
        f"Please clear the balance to continue your training.\n"
        f"Contact us for payment options."
    )
    if db and company_id:
        return await send_sms(db, company_id, phone, msg)
    logger.info("[SMS] To=%s | %s", phone, msg)
    return True


async def send_expense_approved(
    phone: str,
    employee_name: str,
    description: str,
    amount: str,
    *,
    db: AsyncSession | None = None,
    company_id=None,
) -> bool:
    msg = (
        f"Dear {employee_name},\n\n"
        f"Your expense request '{description}' for UGX {amount} "
        f"has been approved.\n"
        f"Finance will process the payment shortly.\n\n"
        f"Thank you."
    )
    if db and company_id:
        return await send_sms(db, company_id, phone, msg)
    logger.info("[SMS] To=%s | %s", phone, msg)
    return True


async def send_welcome_message(
    phone: str,
    client_name: str,
    *,
    db: AsyncSession | None = None,
    company_id=None,
) -> bool:
    msg = (
        f"Welcome to Driving School, {client_name}!\n\n"
        f"We're excited to have you on board.\n"
        f"Your consultation has been scheduled.\n"
        f"We'll be in touch shortly.\n\n"
        f"Drive Safe!"
    )
    if db and company_id:
        return await send_sms(db, company_id, phone, msg)
    logger.info("[SMS] To=%s | %s", phone, msg)
    return True
