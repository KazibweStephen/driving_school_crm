import uuid
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.lead import Lead


async def create_lead(db: AsyncSession, company_id: uuid.UUID, submitted_by_id: str, data: dict) -> Lead:
    lead = Lead(
        company_id=company_id,
        submitted_by_id=submitted_by_id,
        client_name=data["client_name"],
        client_phone=data["client_phone"],
        location=data.get("location"),
        interested_product=data.get("interested_product"),
    )
    db.add(lead)
    await db.flush()
    return lead


async def list_leads(
    db: AsyncSession,
    company_id: Optional[uuid.UUID],
    user_role: str | None = None,
    submitted_by_id: Optional[str] = None,
    status: Optional[str] = None,
) -> list[Lead]:
    query = (
        select(Lead)
        .options(joinedload(Lead.submitted_by))
    )
    if user_role != "super_user" and company_id is not None:
        query = query.where(Lead.company_id == company_id)
    if submitted_by_id:
        query = query.where(Lead.submitted_by_id == submitted_by_id)
    if status:
        query = query.where(Lead.status == status)
    query = query.order_by(Lead.created_at.desc())
    result = await db.execute(query)
    return result.unique().scalars().all()


async def get_lead_by_id(db: AsyncSession, lead_id: uuid.UUID, company_id: Optional[uuid.UUID]) -> Optional[Lead]:
    query = select(Lead).where(Lead.id == lead_id)
    if company_id is not None:
        query = query.where(Lead.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_lead(db: AsyncSession, lead: Lead, data: dict) -> Lead:
    if "status" in data:
        lead.status = data["status"]
    if "admin_notes" in data:
        lead.admin_notes = data["admin_notes"]
    if "converted_consultation_id" in data:
        lead.converted_consultation_id = data["converted_consultation_id"]
        lead.status = "converted"
    await db.flush()
    return lead
