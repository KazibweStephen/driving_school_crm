import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.company import Company
from app.models.permission import RolePermission
from app.models.user import User, UserRole
from app.schemas.permission import (
    CompanyMatrixRead,
    PermissionGroupRead,
    RolePermissionsUpdate,
)
from app.services.permission import (
    catalog_payload,
    get_company_matrix,
    set_role_permissions,
)

router = APIRouter(prefix="/api/v1/permissions", tags=["Permissions"])


async def _resolve_company(db, company_id: uuid.UUID, current_user: User) -> Company:
    """Company-scoped lookup: company_super_user may only touch own company."""
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if current_user.role != UserRole.SUPER_USER and current_user.company_id != company.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.get("/catalog", response_model=list[PermissionGroupRead])
async def get_catalog(
    current_user: User = Depends(require_permission("permissions.manage")),
):
    return catalog_payload()


@router.get("/matrix", response_model=CompanyMatrixRead)
async def get_matrix(
    company_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("permissions.manage")),
):
    if company_id is None:
        if current_user.company_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="company_id is required for super users",
            )
        cid = current_user.company_id
    else:
        try:
            cid = uuid.UUID(company_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid company ID",
            )
    _resolve_company(db, cid, current_user)
    matrix = await get_company_matrix(db, cid)
    return CompanyMatrixRead(company_id=cid, matrix=matrix)


@router.put("/matrix/{role}", response_model=RolePermissionsUpdate)
async def update_role_permissions(
    role: str,
    data: RolePermissionsUpdate,
    company_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("permissions.manage")),
):
    try:
        role_enum = UserRole(role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role: {role}",
        )
    if company_id is None:
        if current_user.company_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="company_id is required for super users",
            )
        cid = current_user.company_id
    else:
        try:
            cid = uuid.UUID(company_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid company ID",
            )
    _resolve_company(db, cid, current_user)
    stored = await set_role_permissions(db, cid, role_enum, data.permissions)
    await db.commit()
    return RolePermissionsUpdate(permissions=stored)


@router.get("/role/{role}")
async def get_role_codes(
    role: str,
    company_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("permissions.manage")),
):
    """Granted codes for a single role (used after matrix edits)."""
    try:
        role_enum = UserRole(role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role: {role}",
        )
    if company_id is None:
        if current_user.company_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="company_id is required for super users",
            )
        cid = current_user.company_id
    else:
        try:
            cid = uuid.UUID(company_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid company ID",
            )
    _resolve_company(db, cid, current_user)
    result = await db.execute(
        select(RolePermission.permission).where(
            RolePermission.company_id == cid,
            RolePermission.role == role_enum,
        )
    )
    return {"role": role, "permissions": sorted(result.scalars().all())}
