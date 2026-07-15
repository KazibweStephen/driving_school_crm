from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_super_user, require_admin_access
from app.core.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.user import (
    UserCreate,
    UserListResponse,
    UserPinChange,
    UserRead,
    UserUpdate,
)
from app.services import user as user_service
from app.services.notification.service import on_user_created, on_pin_reset

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    if data.role == UserRole.COMPANY_SUPER_USER and current_user.role != UserRole.SUPER_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super users can create company_super_user accounts",
        )
    existing = await user_service.get_user_by_phone(db, data.phone)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this phone already exists",
        )
    user, initial_pin = await user_service.create_user(
        db, data.phone, data.name, data.role, current_user.phone,
        is_company_admin=data.is_company_admin,
        company_id=data.company_id or current_user.company_id,
        can_backdate=data.can_backdate,
    )
    target_company_id = data.company_id or current_user.company_id
    if target_company_id:
        await on_user_created(
            db, target_company_id, data.phone, data.name, initial_pin,
        )
    return UserRead.model_validate(user)


@router.get("/", response_model=UserListResponse)
async def list_users(
    search: str | None = Query(None, max_length=50),
    role: UserRole | None = None,
    status: UserStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users, total = await user_service.list_users(
        db, search=search, role=role, status=status, page=page, page_size=page_size,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    return UserListResponse(
        users=[UserRead.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/me", response_model=UserRead)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    return UserRead.model_validate(current_user)


@router.get("/{phone}", response_model=UserRead)
async def get_user(
    phone: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await user_service.get_user_by_phone_with_company(
        db, phone,
        company_id=current_user.company_id,
        current_user_role=current_user.role,
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return UserRead.model_validate(user)


@router.patch("/{phone}", response_model=UserRead)
async def update_user(
    phone: str,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    if data.role == UserRole.COMPANY_SUPER_USER and current_user.role != UserRole.SUPER_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super users can assign company_super_user role",
        )
    user = await user_service.get_user_by_phone(db, phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    updated = await user_service.update_user(
        db, user, name=data.name, role=data.role, status=data.status,
        is_company_admin=data.is_company_admin,
        company_id=data.company_id,
        can_backdate=data.can_backdate,
    )
    return UserRead.model_validate(updated)


@router.delete("/{phone}", response_model=UserRead)
async def deactivate_user(
    phone: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    if phone == current_user.phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )
    user = await user_service.get_user_by_phone(db, phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.status == UserStatus.DEACTIVATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already deactivated",
        )
    updated = await user_service.deactivate_user(db, user)
    return UserRead.model_validate(updated)


@router.post("/{phone}/approve", response_model=UserRead)
async def approve_user(
    phone: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    user = await user_service.get_user_by_phone(db, phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.status != UserStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not in pending approval status",
        )
    if user.role != UserRole.COMPANY_SUPER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only company_super_user accounts require approval",
        )
    user.status = UserStatus.ACTIVE
    user.failed_login_attempts = 0
    await db.flush()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.post("/{phone}/reset-pin", response_model=dict)
async def reset_user_pin(
    phone: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_access),
):
    user = await user_service.get_user_by_phone(db, phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    user, new_pin = await user_service.reset_user_pin(db, user)
    if user.company_id:
        await on_pin_reset(
            db, user.company_id, phone, user.name, new_pin,
        )
    elif user.role.value == "super_user":
        # Super users have no company; try to send via the default company
        from sqlalchemy import select as sa_select
        from app.models.company import Company
        default_company_result = await db.execute(
            sa_select(Company).where(Company.is_active == True).limit(1)
        )
        default_company = default_company_result.scalar_one_or_none()
        if default_company:
            await on_pin_reset(
                db, default_company.id, phone, user.name, new_pin,
            )
    return {"message": "PIN reset successfully", "new_pin": new_pin}


@router.post("/change-pin", response_model=dict)
async def change_own_pin(
    data: UserPinChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await user_service.change_user_pin(db, current_user, data.old_pin, data.new_pin)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return {"message": "PIN changed successfully"}
