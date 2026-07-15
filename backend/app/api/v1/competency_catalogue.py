import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_access
from app.core.database import get_db
from app.models.user import User
from app.schemas.competency_catalogue import (
    CompetencyBulkImportRequest,
    CompetencyBulkImportResponse,
    CompetencyCategoryCreate,
    CompetencyCategoryRead,
    CompetencyCategoryUpdate,
    CompetencyCreate,
    CompetencyRead,
    CompetencyReadWithRelations,
    CompetencyUpdate,
    CompetencyVersionCreate,
    CompetencyVersionRead,
    CompetencyVersionUpdate,
    LessonCompetencyLink,
)
from app.services import competency_catalogue as svc

router = APIRouter(prefix="/api/v1", tags=["competency-catalogue"])


# ── Helpers ──


def _resolve_company_id(
    user: User, company_id_override: _uuid.UUID | None = None
) -> _uuid.UUID | None:
    """Reads: super_user can override via query param; otherwise token company_id (may be None → all)."""
    if user.role and user.role.value == "super_user":
        return company_override if (company_override := company_id_override) else user.company_id
    if not user.company_id:
        raise HTTPException(status_code=400, detail="No company assigned")
    return user.company_id


def _require_company_id(user: User) -> _uuid.UUID:
    """Writes: all users must have a company_id."""
    if user.company_id:
        return user.company_id
    raise HTTPException(status_code=400, detail="No company assigned")


# ── Versions ──


@router.get("/competency-versions", response_model=list[CompetencyVersionRead])
async def list_versions(
    status: str | None = None,
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _uuid.UUID(company_id) if company_id else None
    return await svc.list_versions(db, _resolve_company_id(current_user, cid), status)


@router.post("/competency-versions", response_model=CompetencyVersionRead)
async def create_version(
    data: CompetencyVersionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.create_version(
            db, _require_company_id(current_user), data.version, data.name,
            data.description, current_user.phone,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/competency-versions/{version_id}", response_model=CompetencyVersionRead)
async def get_version(
    version_id: str,
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _uuid.UUID(company_id) if company_id else None
    v = await svc.get_version(db, _uuid.UUID(version_id), _resolve_company_id(current_user, cid))
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    count = len([c for c in v.competencies if c.is_active])
    return CompetencyVersionRead(
        id=v.id, company_id=v.company_id, version=v.version, name=v.name,
        description=v.description, status=v.status.value, competency_count=count,
        created_by_phone=v.created_by_phone, created_at=v.created_at, updated_at=v.updated_at,
    )


@router.patch("/competency-versions/{version_id}", response_model=CompetencyVersionRead)
async def update_version(
    version_id: str,
    data: CompetencyVersionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.update_version(
            db, _uuid.UUID(version_id), _require_company_id(current_user),
            data.name, data.description, data.status,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/competency-versions/{version_id}/activate", response_model=CompetencyVersionRead)
async def activate_version(
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.activate_version(db, _uuid.UUID(version_id), _require_company_id(current_user))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/competency-versions/{version_id}")
async def delete_version(
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        await svc.delete_version(db, _uuid.UUID(version_id), _require_company_id(current_user))
        return {"detail": "Version deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Categories ──


@router.get("/competency-categories", response_model=list[CompetencyCategoryRead])
async def list_categories(
    include_inactive: bool = False,
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _uuid.UUID(company_id) if company_id else None
    return await svc.list_categories(db, _resolve_company_id(current_user, cid), include_inactive)


@router.post("/competency-categories", response_model=CompetencyCategoryRead)
async def create_category(
    data: CompetencyCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.create_category(
            db, _require_company_id(current_user), data.name, data.description, data.display_order,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/competency-categories/{category_id}", response_model=CompetencyCategoryRead)
async def update_category(
    category_id: str,
    data: CompetencyCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.update_category(
            db, _uuid.UUID(category_id), _require_company_id(current_user),
            data.name, data.description, data.display_order, data.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/competency-categories/{category_id}")
async def delete_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        await svc.delete_category(db, _uuid.UUID(category_id), _require_company_id(current_user))
        return {"detail": "Category deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Competencies ──


@router.get("/competencies")
async def list_competencies(
    version_id: str | None = None,
    category_id: str | None = None,
    difficulty: str | None = None,
    training_category: str | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vid = _uuid.UUID(version_id) if version_id else None
    cid = _uuid.UUID(category_id) if category_id else None
    comp_cid = _uuid.UUID(company_id) if company_id else None

    items, total = await svc.list_competencies(
        db, _resolve_company_id(current_user, comp_cid), vid, cid, difficulty, training_category,
        search, is_active, page, page_size,
    )
    return {
        "items": [CompetencyRead.model_validate(i) for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/competencies", response_model=CompetencyRead)
async def create_competency(
    data: CompetencyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.create_competency(
            db, _require_company_id(current_user), data.version_id, data.category_id,
            data.code, data.name, data.description, data.learning_outcome,
            data.assessment_criteria, data.difficulty, data.estimated_practice_minutes,
            data.training_category, data.display_order, data.prerequisite_ids,
            current_user.phone,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Search ──


@router.get("/competencies/search")
async def search_competencies(
    q: str | None = None,
    category_id: str | None = None,
    difficulty: str | None = None,
    training_category: str | None = None,
    version_id: str | None = None,
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _uuid.UUID(category_id) if category_id else None
    vid = _uuid.UUID(version_id) if version_id else None
    comp_cid = _uuid.UUID(company_id) if company_id else None

    items = await svc.search_competencies(
        db, _resolve_company_id(current_user, comp_cid), q, cid, difficulty, training_category, vid,
    )
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "category_id": c.category_id,
            "category_name": c.category.name if c.category else None,
            "difficulty": c.difficulty.value,
            "training_category": c.training_category.value,
        }
        for c in items
    ]


@router.get("/competencies/{competency_id}", response_model=CompetencyReadWithRelations)
async def get_competency(
    competency_id: str,
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _uuid.UUID(company_id) if company_id else None
    comp = await svc.get_competency(db, _uuid.UUID(competency_id), _resolve_company_id(current_user, cid))
    if not comp:
        raise HTTPException(status_code=404, detail="Competency not found")
    return comp


@router.patch("/competencies/{competency_id}", response_model=CompetencyRead)
async def update_competency(
    competency_id: str,
    data: CompetencyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.update_competency(
            db, _uuid.UUID(competency_id), _require_company_id(current_user),
            data.category_id, data.name, data.description, data.learning_outcome,
            data.assessment_criteria, data.difficulty, data.estimated_practice_minutes,
            data.training_category, data.display_order, data.is_active,
            data.prerequisite_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/competencies/{competency_id}/deactivate", response_model=CompetencyRead)
async def deactivate_competency(
    competency_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    try:
        return await svc.deactivate_competency(
            db, _uuid.UUID(competency_id), _require_company_id(current_user),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Bulk Import ──


@router.post("/competency-import", response_model=CompetencyBulkImportResponse)
async def bulk_import(
    data: CompetencyBulkImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    return await svc.bulk_import(
        db, _require_company_id(current_user),
        [item.model_dump() for item in data.competencies],
    )


# ── Lesson ↔ Competency Links ──


@router.get("/lesson-library/{lesson_id}/competencies")
async def get_lesson_competencies(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.get_lesson_competencies(db, _uuid.UUID(lesson_id))


@router.put("/lesson-library/{lesson_id}/competencies")
async def set_lesson_competencies(
    lesson_id: str,
    links: list[LessonCompetencyLink],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    await svc.set_lesson_competencies(
        db, _uuid.UUID(lesson_id),
        [link.model_dump() for link in links],
    )
    return await svc.get_lesson_competencies(db, _uuid.UUID(lesson_id))
