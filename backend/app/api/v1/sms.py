import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_access
from app.core.database import get_db
from app.models.user import User
from app.schemas.sms import (
    CompanySmsSettingsRead,
    CompanySmsSettingsUpdate,
    SendSmsRequest,
    SendTemplateSmsRequest,
    SmsTemplateCreate,
    SmsTemplateRead,
    SmsTemplateUpdate,
    TestSmsRequest,
)
from app.services import sms as sms_service
from app.services.notification.service import send_sms, send_template_sms

router = APIRouter(prefix="/sms", tags=["sms"])


# ── Settings ──


@router.get("/settings/{company_id}", response_model=CompanySmsSettingsRead)
async def get_sms_settings(
    company_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    settings = await sms_service.get_company_sms_settings(db, company_id)
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS settings not found for this company",
        )
    return CompanySmsSettingsRead.model_validate(settings)


@router.put("/settings/{company_id}", response_model=CompanySmsSettingsRead)
async def upsert_sms_settings(
    company_id: uuid.UUID,
    data: CompanySmsSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    settings = await sms_service.upsert_company_sms_settings(
        db,
        company_id,
        is_active=data.is_active,
        provider=data.provider,
        egosms_api_url=data.egosms_api_url,
        egosms_username=data.egosms_username,
        egosms_password=data.egosms_password,
        egosms_sender=data.egosms_sender,
        twilio_account_sid=data.twilio_account_sid,
        twilio_auth_token=data.twilio_auth_token,
        twilio_phone_number=data.twilio_phone_number,
    )
    return CompanySmsSettingsRead.model_validate(settings)


@router.post("/settings/{company_id}/test")
async def test_sms(
    company_id: uuid.UUID,
    data: TestSmsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    ok = await send_sms(db, company_id, data.phone, "Test SMS from your CRM. If you receive this, your SMS provider is configured correctly.")
    if ok:
        return {"message": "Test SMS sent successfully"}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Failed to send test SMS. Check your provider credentials.",
    )


# ── Templates ──


@router.get("/templates/{company_id}", response_model=list[SmsTemplateRead])
async def list_templates(
    company_id: uuid.UUID,
    category: str | None = None,
    trigger_event: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    templates = await sms_service.list_sms_templates(db, company_id, category=category, trigger_event=trigger_event)
    return [SmsTemplateRead.model_validate(t) for t in templates]


@router.get("/templates/detail/{template_id}", response_model=SmsTemplateRead)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    template = await sms_service.get_sms_template(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return SmsTemplateRead.model_validate(template)


@router.post("/templates/{company_id}", response_model=SmsTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    company_id: uuid.UUID,
    data: SmsTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    template = await sms_service.create_sms_template(
        db,
        company_id,
        name=data.name,
        category=data.category,
        trigger_event=data.trigger_event,
        body=data.body,
        is_active=data.is_active,
    )
    return SmsTemplateRead.model_validate(template)


@router.patch("/templates/{template_id}", response_model=SmsTemplateRead)
async def update_template(
    template_id: uuid.UUID,
    data: SmsTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    template = await sms_service.get_sms_template(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    updated = await sms_service.update_sms_template(
        db,
        template,
        name=data.name,
        category=data.category,
        trigger_event=data.trigger_event,
        body=data.body,
        is_active=data.is_active,
    )
    return SmsTemplateRead.model_validate(updated)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    template = await sms_service.get_sms_template(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    await sms_service.delete_sms_template(db, template)


# ── Send ──


@router.post("/send/{company_id}")
async def send_arbitrary_sms(
    company_id: uuid.UUID,
    data: SendSmsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    ok = await send_sms(db, company_id, data.phone, data.message)
    if ok:
        return {"message": "SMS sent successfully"}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Failed to send SMS",
    )


@router.post("/send-template/{company_id}")
async def send_from_template(
    company_id: uuid.UUID,
    data: SendTemplateSmsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    ok = await send_template_sms(db, company_id, data.phone, data.category, data.variables)
    if ok:
        return {"message": "Template SMS sent successfully"}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Failed to send template SMS. Check that an active template exists for this category.",
    )
