import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    ALL_PERMISSIONS_SET,
    PERMISSION_GROUPS,
    SUPER_USER_PERMISSIONS,
    default_permissions_for,
    expand_permissions,
)
from app.models.permission import RolePermission
from app.models.user import User, UserRole


async def get_role_permissions(
    db: AsyncSession, company_id: uuid.UUID, role: UserRole
) -> set[str]:
    """Granted permission codes for a role in a company (expanded set).

    ``super_user`` implicitly holds every permission.
    """
    if role == UserRole.SUPER_USER:
        return set(SUPER_USER_PERMISSIONS)
    result = await db.execute(
        select(RolePermission.permission).where(
            RolePermission.company_id == company_id,
            RolePermission.role == role,
        )
    )
    return set(result.scalars().all())


async def get_user_permissions(db: AsyncSession, user: User) -> set[str]:
    """Granted permission codes for a user (company + role based)."""
    if user.role == UserRole.SUPER_USER:
        return set(SUPER_USER_PERMISSIONS)
    if user.company_id is None:
        return set()
    return await get_role_permissions(db, user.company_id, user.role)


async def has_permission(db: AsyncSession, user: User, permission: str) -> bool:
    if user.role == UserRole.SUPER_USER:
        return True
    if user.company_id is None:
        return False
    result = await db.execute(
        select(RolePermission.id).where(
            RolePermission.company_id == user.company_id,
            RolePermission.role == user.role,
            RolePermission.permission == permission,
        )
    )
    return result.scalar_one_or_none() is not None


async def seed_default_permissions(db: AsyncSession, company_id: uuid.UUID) -> None:
    """Insert default permission grants for every non-super role in a company."""
    roles = [
        r
        for r in UserRole
        if r != UserRole.SUPER_USER
    ]
    for role in roles:
        for code in default_permissions_for(role):
            db.add(RolePermission(company_id=company_id, role=role, permission=code))
    await db.flush()


async def set_role_permissions(
    db: AsyncSession, company_id: uuid.UUID, role: UserRole, codes: list[str]
) -> list[str]:
    """Replace a role's grants in a company with the given codes (expanded).

    Returns the final stored (expanded) list.
    """
    if role == UserRole.SUPER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="super_user permissions cannot be edited",
        )
    invalid = [c for c in codes if c not in ALL_PERMISSIONS_SET]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission codes: {', '.join(sorted(set(invalid)))}",
        )

    expanded = expand_permissions(codes)

    await db.execute(
        delete(RolePermission).where(
            RolePermission.company_id == company_id,
            RolePermission.role == role,
        )
    )
    for code in expanded:
        db.add(RolePermission(company_id=company_id, role=role, permission=code))
    await db.flush()
    return sorted(expanded)


async def get_company_matrix(
    db: AsyncSession, company_id: uuid.UUID
) -> dict[str, list[str]]:
    """Full role → expanded codes matrix for a company."""
    matrix: dict[str, list[str]] = {}
    for role in UserRole:
        if role == UserRole.SUPER_USER:
            continue
        matrix[role.value] = sorted(
            await get_role_permissions(db, company_id, role)
        )
    return matrix


def catalog_payload() -> list[dict]:
    return [
        {"key": g.key, "label": g.label, "codes": g.codes}
        for g in PERMISSION_GROUPS
    ]
