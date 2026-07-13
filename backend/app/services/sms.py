import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanySmsSettings
from app.models.sms import SmsTemplate, SmsTemplateCategory


# ── Settings CRUD ──


async def get_company_sms_settings(
    db: AsyncSession, company_id: uuid.UUID
) -> CompanySmsSettings | None:
    result = await db.execute(
        select(CompanySmsSettings).where(CompanySmsSettings.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def upsert_company_sms_settings(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    is_active: bool | None = None,
    provider: str | None = None,
    egosms_api_url: str | None = None,
    egosms_username: str | None = None,
    egosms_password: str | None = None,
    egosms_sender: str | None = None,
    twilio_account_sid: str | None = None,
    twilio_auth_token: str | None = None,
    twilio_phone_number: str | None = None,
) -> CompanySmsSettings:
    existing = await get_company_sms_settings(db, company_id)
    if existing:
        if is_active is not None:
            existing.is_active = is_active
        if provider is not None:
            existing.provider = provider
        if egosms_api_url is not None:
            existing.egosms_api_url = egosms_api_url
        if egosms_username is not None:
            existing.egosms_username = egosms_username
        if egosms_password is not None:
            existing.egosms_password = egosms_password
        if egosms_sender is not None:
            existing.egosms_sender = egosms_sender
        if twilio_account_sid is not None:
            existing.twilio_account_sid = twilio_account_sid
        if twilio_auth_token is not None:
            existing.twilio_auth_token = twilio_auth_token
        if twilio_phone_number is not None:
            existing.twilio_phone_number = twilio_phone_number
        await db.flush()
        await db.refresh(existing)
        return existing

    settings = CompanySmsSettings(
        company_id=company_id,
        is_active=is_active or False,
        provider=provider or "logging",
        egosms_api_url=egosms_api_url or "https://www.egosms.co/api/v1/plain/",
        egosms_username=egosms_username or "",
        egosms_password=egosms_password or "",
        egosms_sender=egosms_sender or "",
        twilio_account_sid=twilio_account_sid or "",
        twilio_auth_token=twilio_auth_token or "",
        twilio_phone_number=twilio_phone_number or "",
    )
    db.add(settings)
    await db.flush()
    await db.refresh(settings)
    return settings


# ── Template CRUD ──


async def list_sms_templates(
    db: AsyncSession,
    company_id: uuid.UUID,
    category: str | None = None,
) -> list[SmsTemplate]:
    query = select(SmsTemplate).where(SmsTemplate.company_id == company_id)
    if category:
        query = query.where(SmsTemplate.category == category)
    query = query.order_by(SmsTemplate.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_sms_template(
    db: AsyncSession, template_id: uuid.UUID
) -> SmsTemplate | None:
    result = await db.execute(
        select(SmsTemplate).where(SmsTemplate.id == template_id)
    )
    return result.scalar_one_or_none()


async def create_sms_template(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    name: str,
    category: str,
    body: str,
    is_active: bool = True,
) -> SmsTemplate:
    template = SmsTemplate(
        company_id=company_id,
        name=name,
        category=category,
        body=body,
        is_active=is_active,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


async def update_sms_template(
    db: AsyncSession,
    template: SmsTemplate,
    *,
    name: str | None = None,
    category: str | None = None,
    body: str | None = None,
    is_active: bool | None = None,
) -> SmsTemplate:
    if name is not None:
        template.name = name
    if category is not None:
        template.category = category
    if body is not None:
        template.body = body
    if is_active is not None:
        template.is_active = is_active
    await db.flush()
    await db.refresh(template)
    return template


async def delete_sms_template(db: AsyncSession, template: SmsTemplate) -> None:
    await db.delete(template)
    await db.flush()


# ── Template resolution & rendering ──


async def resolve_template(
    db: AsyncSession,
    company_id: uuid.UUID,
    category: str,
) -> SmsTemplate | None:
    """Get the first active template for a category."""
    result = await db.execute(
        select(SmsTemplate).where(
            SmsTemplate.company_id == company_id,
            SmsTemplate.category == category,
            SmsTemplate.is_active == True,
        ).limit(1)
    )
    return result.scalar_one_or_none()


def render_template(body: str, variables: dict[str, str]) -> str:
    """Replace {key} placeholders in template body with variable values."""
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        return variables.get(key, match.group(0))
    return re.sub(r"\{(\w+)\}", _replace, body)
