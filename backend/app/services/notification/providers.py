import logging
from typing import Protocol, runtime_checkable

import httpx

logger = logging.getLogger(__name__)


def _log_sms(msg: str) -> None:
    """Print to stdout so it shows in docker logs regardless of log config."""
    print(f"[SMS] {msg}", flush=True)


@runtime_checkable
class SmsProvider(Protocol):
    async def send(self, phone: str, message: str) -> bool: ...


class LoggingProvider:
    """Default provider. Logs messages instead of sending. Used for testing."""

    async def send(self, phone: str, message: str) -> bool:
        logger.info("[SMS] To=%s | %s", phone, message)
        return True


class EgoSmsProvider:
    """Sends SMS via the egoSMS HTTP API."""

    def __init__(
        self,
        api_url: str,
        username: str,
        password: str,
        sender: str,
    ) -> None:
        self.api_url = api_url
        self.username = username
        self.password = password
        self.sender = sender

    async def send(self, phone: str, message: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                params = {
                    "username": self.username,
                    "password": self.password,
                    "number": phone,
                    "message": message,
                    "sender": self.sender,
                }
                resp = await client.get(self.api_url, params=params)
                body = resp.text
                _log_sms(f"egoSMS response {resp.status_code}: {body}")
                if "error" in body.lower() or "empty" in body.lower() or "wrong" in body.lower():
                    _log_sms(f"egoSMS error: {body}")
                    return False
                _log_sms(f"egoSMS sent to {phone} OK")
                return True
        except Exception as e:
            _log_sms(f"egoSMS FAILED to {phone}: {e}")
            return False


class TwilioProvider:
    """Sends SMS via the Twilio REST API."""

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        phone_number: str,
    ) -> None:
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.phone_number = phone_number

    async def send(self, phone: str, message: str) -> bool:
        try:
            from twilio.rest import Client
            client = Client(self.account_sid, self.auth_token)
            client.messages.create(
                body=message,
                from_=self.phone_number,
                to=phone,
            )
            logger.info("[SMS:Twilio] Sent to %s OK", phone)
            return True
        except Exception as e:
            logger.error("[SMS:Twilio] Failed to send to %s: %s", phone, e)
            return False


def get_provider(
    provider_name: str,
    *,
    egosms_api_url: str = "",
    egosms_username: str = "",
    egosms_password: str = "",
    egosms_sender: str = "",
    twilio_account_sid: str = "",
    twilio_auth_token: str = "",
    twilio_phone_number: str = "",
) -> SmsProvider:
    """Factory that returns the appropriate SmsProvider."""
    if provider_name == "egosms":
        return EgoSmsProvider(
            api_url=egosms_api_url,
            username=egosms_username,
            password=egosms_password,
            sender=egosms_sender,
        )
    if provider_name == "twilio":
        return TwilioProvider(
            account_sid=twilio_account_sid,
            auth_token=twilio_auth_token,
            phone_number=twilio_phone_number,
        )
    return LoggingProvider()
