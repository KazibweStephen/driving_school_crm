import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lead import LeadCreate, LeadRead, LeadUpdate
from app.services import lead as lead_service
from app.utils.tenant import resolve_company_id

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
async def create_lead(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    lead = await lead_service.create_lead(db, company_id, current_user.phone, data.model_dump())
    lead_read = await lead_service.get_lead_by_id(db, lead.id, company_id)
    return LeadRead(
        id=lead_read.id, company_id=lead_read.company_id,
        submitted_by_id=lead_read.submitted_by_id,
        client_name=lead_read.client_name, client_phone=lead_read.client_phone,
        location=lead_read.location, interested_product=lead_read.interested_product,
        status=lead_read.status.value if hasattr(lead_read.status, 'value') else str(lead_read.status),
        admin_notes=lead_read.admin_notes,
        converted_consultation_id=lead_read.converted_consultation_id,
        created_at=lead_read.created_at,
        submitted_by_name=current_user.name,
    )


@router.get("", response_model=list[LeadRead])
async def list_leads(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submitted_by = None
    if current_user.role in ("instructor",):
        submitted_by = current_user.phone
    items = await lead_service.list_leads(
        db, current_user.company_id, current_user.role,
        submitted_by_id=submitted_by, status=status,
    )
    return [
        LeadRead(
            id=item.id, company_id=item.company_id,
            submitted_by_id=item.submitted_by_id,
            client_name=item.client_name, client_phone=item.client_phone,
            location=item.location, interested_product=item.interested_product,
            status=item.status.value if hasattr(item.status, 'value') else str(item.status),
            admin_notes=item.admin_notes,
            converted_consultation_id=item.converted_consultation_id,
            created_at=item.created_at,
            submitted_by_name=item.submitted_by.name if item.submitted_by else None,
        )
        for item in items
    ]


@router.patch("/{lead_id}", response_model=LeadRead)
async def update_lead(
    lead_id: uuid.UUID,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead = await lead_service.get_lead_by_id(db, lead_id, current_user.company_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    await lead_service.update_lead(db, lead, data.model_dump(exclude_unset=True))
    updated = await lead_service.get_lead_by_id(db, lead_id, current_user.company_id)
    return LeadRead(
        id=updated.id, company_id=updated.company_id,
        submitted_by_id=updated.submitted_by_id,
        client_name=updated.client_name, client_phone=updated.client_phone,
        location=updated.location, interested_product=updated.interested_product,
        status=updated.status.value if hasattr(updated.status, 'value') else str(updated.status),
        admin_notes=updated.admin_notes,
        converted_consultation_id=updated.converted_consultation_id,
        created_at=updated.created_at,
        submitted_by_name=updated.submitted_by.name if updated.submitted_by else None,
    )
