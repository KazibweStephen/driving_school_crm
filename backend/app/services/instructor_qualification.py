import uuid
from datetime import datetime

from sqlalchemy import select, join
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson_plan import InstructorQualification, TransmissionType
from app.models.user import User, UserRole


async def create_qualification(
    db: AsyncSession,
    instructor_phone: str,
    transmission_type: str,
    is_certified: bool = False,
    certified_at: datetime | None = None,
    expires_at: datetime | None = None,
    notes: str | None = None,
) -> InstructorQualification:
    qual = InstructorQualification(
        instructor_phone=instructor_phone,
        transmission_type=TransmissionType(transmission_type),
        is_certified=is_certified,
        certified_at=certified_at,
        expires_at=expires_at,
        notes=notes,
    )
    db.add(qual)
    await db.flush()
    return qual


async def list_qualifications(
    db: AsyncSession,
    instructor_phone: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[InstructorQualification]:
    query = select(InstructorQualification).join(
        User, InstructorQualification.instructor_phone == User.phone
    )
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.where(User.company_id == company_id)
    if instructor_phone:
        query = query.where(
            InstructorQualification.instructor_phone == instructor_phone
        )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_qualification(
    db: AsyncSession,
    qual_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> InstructorQualification | None:
    query = select(InstructorQualification).where(InstructorQualification.id == qual_id)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.join(
            User, InstructorQualification.instructor_phone == User.phone
        ).where(User.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_qualification(
    db: AsyncSession,
    qual_id: uuid.UUID,
    is_certified: bool | None = None,
    certified_at: datetime | None = None,
    expires_at: datetime | None = None,
    notes: str | None = None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> InstructorQualification | None:
    qual = await get_qualification(db, qual_id, company_id=company_id, current_user_role=current_user_role)
    if not qual:
        return None
    if is_certified is not None:
        qual.is_certified = is_certified
    if certified_at is not None:
        qual.certified_at = certified_at
    if expires_at is not None:
        qual.expires_at = expires_at
    if notes is not None:
        qual.notes = notes
    await db.flush()
    return qual


async def delete_qualification(
    db: AsyncSession,
    qual_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> bool:
    qual = await get_qualification(db, qual_id, company_id=company_id, current_user_role=current_user_role)
    if not qual:
        return False
    await db.delete(qual)
    await db.flush()
    return True
