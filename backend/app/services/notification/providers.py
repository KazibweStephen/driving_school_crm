import logging
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import httpx

logger = logging.getLogger(__name__)


def _log_sms(msg: str) -> None:
    """Print to stdout so it shows in docker logs regardless of log config."""
    print(f"[SMS] {msg}", flush=True)


@dataclass
class SmsSendResult:
    success: bool
    response: str = ""


@runtime_checkable
class SmsProvider(Protocol):
    async def send(self, phone: str, message: str) -> SmsSendResult: ...


class LoggingProvider:
    """Default provider. Logs messages instead of sending. Used for testing."""

    async def send(self, phone: str, message: str) -> SmsSendResult:
        _log_sms(f"To={phone} | {message}")
        return SmsSendResult(success=True, response="logged")


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

    async def send(self, phone: str, message: str) -> SmsSendResult:
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
                    return SmsSendResult(success=False, response=body)
                _log_sms(f"egoSMS sent to {phone} OK")
                return SmsSendResult(success=True, response=body)
        except Exception as e:
            _log_sms(f"egoSMS FAILED to {phone}: {e}")
            return SmsSendResult(success=False, response=str(e))


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

    async def send(self, phone: str, message: str) -> SmsSendResult:
        try:
            from twilio.rest import Client
            client = Client(self.account_sid, self.auth_token)
            msg = client.messages.create(
                body=message,
                from_=self.phone_number,
                to=phone,
            )
            _log_sms(f"Twilio sent to {phone} OK sid={msg.sid}")
            return SmsSendResult(success=True, response=f"sid={msg.sid}")
        except Exception as e:
            _log_sms(f"Twilio FAILED to {phone}: {e}")
            return SmsSendResult(success=False, response=str(e))


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
