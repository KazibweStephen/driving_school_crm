import logging
from enum import Enum

from app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationChannel(str, Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"


class NotificationService:
    """Sends notifications via configured provider (Twilio, logging stub, etc.)."""

    def __init__(self) -> None:
        self.provider = settings.sms_provider

    async def send_sms(self, to: str, message: str) -> bool:
        if self.provider == "twilio":
            return await self._send_twilio(to, message)
        logger.info("[SMS] To=%s | %s", to, message)
        return True

    async def send_whatsapp(self, to: str, message: str) -> bool:
        if self.provider == "twilio":
            return await self._send_twilio_whatsapp(to, message)
        logger.info("[WhatsApp] To=%s | %s", to, message)
        return True

    async def _send_twilio(self, to: str, message: str) -> bool:
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(
                body=message,
                from_=settings.twilio_phone_number,
                to=to,
            )
            return True
        except Exception as e:
            logger.error("Twilio SMS failed: %s", e)
            return False

    async def _send_twilio_whatsapp(self, to: str, message: str) -> bool:
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(
                body=message,
                from_=f"whatsapp:{settings.twilio_phone_number}",
                to=f"whatsapp:{to}",
            )
            return True
        except Exception as e:
            logger.error("Twilio WhatsApp failed: %s", e)
            return False


_notifier = NotificationService()


async def send_payment_receipt(
    phone: str,
    client_name: str,
    receipt_number: str,
    amount: str,
    download_url: str,
) -> bool:
    msg = (
        f"Dear {client_name},\n\n"
        f"Thank you for your payment of UGX {amount}.\n"
        f"Receipt: {receipt_number}\n\n"
        f"Download receipt: {download_url}\n\n"
        f"Drive Safe! 🚗"
    )
    return await _notifier.send_sms(phone, msg)


async def send_installment_reminder(
    phone: str,
    client_name: str,
    due_date: str,
    amount: str,
    balance: str,
) -> bool:
    msg = (
        f"Dear {client_name},\n\n"
        f"Reminder: Installment of UGX {amount} is due on {due_date}.\n"
        f"Outstanding balance: UGX {balance}\n\n"
        f"Please make payment to avoid interruption of lessons.\n"
        f"Thank you!"
    )
    return await _notifier.send_sms(phone, msg)


async def send_dunning_notice(
    phone: str,
    client_name: str,
    overdue_amount: str,
    days_overdue: int,
    total_balance: str,
) -> bool:
    msg = (
        f"Dear {client_name},\n\n"
        f"Friendly reminder: Your payment of UGX {overdue_amount} "
        f"is {days_overdue} day(s) overdue.\n"
        f"Total outstanding: UGX {total_balance}\n\n"
        f"Please clear the balance to continue your training.\n"
        f"Contact us for payment options."
    )
    return await _notifier.send_sms(phone, msg)


async def send_expense_approved(
    phone: str,
    employee_name: str,
    description: str,
    amount: str,
) -> bool:
    msg = (
        f"Dear {employee_name},\n\n"
        f"Your expense request '{description}' for UGX {amount} "
        f"has been approved.\n"
        f"Finance will process the payment shortly.\n\n"
        f"Thank you."
    )
    return await _notifier.send_sms(phone, msg)


async def send_welcome_message(phone: str, client_name: str) -> bool:
    msg = (
        f"Welcome to Driving School, {client_name}! 🎉\n\n"
        f"We're excited to have you on board.\n"
        f"Your consultation has been scheduled.\n"
        f"We'll be in touch shortly.\n\n"
        f"Drive Safe!"
    )
    return await _notifier.send_sms(phone, msg)
