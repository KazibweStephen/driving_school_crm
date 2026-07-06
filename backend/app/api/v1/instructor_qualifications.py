import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import (
    InstructorQualificationCreate,
    InstructorQualificationRead,
    InstructorQualificationUpdate,
)
from app.services import instructor_qualification as qual_service

router = APIRouter(tags=["instructor-qualifications"])


@router.post(
    "/api/v1/instructor-qualifications",
    response_model=InstructorQualificationRead,
    status_code=201,
)
async def create_qualification(
    data: InstructorQualificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    qual = await qual_service.create_qualification(
        db,
        instructor_phone=data.instructor_phone,
        transmission_type=data.transmission_type,
        is_certified=data.is_certified,
        certified_at=data.certified_at,
        expires_at=data.expires_at,
        notes=data.notes,
    )
    return InstructorQualificationRead.model_validate(qual)


@router.get(
    "/api/v1/instructor-qualifications",
    response_model=list[InstructorQualificationRead],
)
async def list_qualifications(
    instructor_phone: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quals = await qual_service.list_qualifications(db, instructor_phone)
    return [InstructorQualificationRead.model_validate(q) for q in quals]


@router.get(
    "/api/v1/instructor-qualifications/{qual_id}",
    response_model=InstructorQualificationRead,
)
async def get_qualification(
    qual_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        qid = uuid.UUID(qual_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    qual = await qual_service.get_qualification(db, qid)
    if not qual:
        raise HTTPException(status_code=404, detail="Qualification not found")
    return InstructorQualificationRead.model_validate(qual)


@router.patch(
    "/api/v1/instructor-qualifications/{qual_id}",
    response_model=InstructorQualificationRead,
)
async def update_qualification(
    qual_id: str,
    data: InstructorQualificationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        qid = uuid.UUID(qual_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    qual = await qual_service.update_qualification(
        db, qid, is_certified=data.is_certified, certified_at=data.certified_at,
        expires_at=data.expires_at, notes=data.notes,
    )
    if not qual:
        raise HTTPException(status_code=404, detail="Qualification not found")
    return InstructorQualificationRead.model_validate(qual)


@router.delete("/api/v1/instructor-qualifications/{qual_id}", status_code=204)
async def delete_qualification(
    qual_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        qid = uuid.UUID(qual_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    deleted = await qual_service.delete_qualification(db, qid)
    if not deleted:
        raise HTTPException(status_code=404, detail="Qualification not found")
