from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import uuid as _uuid

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_pin,
)
from sqlalchemy import select

from app.models.company import Company
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import (
    CompanySwitchRequest,
    LoginRequest,
    PinResetRequest,
    PinResetVerifyRequest,
    RefreshRequest,
    TokenResponse,
)
from app.api.deps import require_super_user
from app.services.permission import get_user_permissions
from app.services import user as user_service
from app.services.user import get_user_by_phone
from app.services.notification.service import on_pin_reset_otp

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_LOGIN_ATTEMPTS = 5


async def _effective_company(
    db: AsyncSession,
    user: User,
    preferred_id: _uuid.UUID | None = None,
) -> tuple[_uuid.UUID | None, str]:
    """Resolve the (company_id, currency) for the user's session.

    For super_users the active company comes from ``preferred_id`` (carried in
    the refresh token) or their stored company_id, falling back to the first
    active company. Regular users are always tied to their stored company_id.
    """
    if user.role == UserRole.SUPER_USER:
        candidate = preferred_id or user.company_id
        if candidate is not None:
            company_result = await db.execute(
                select(Company).where(Company.id == candidate, Company.is_active == True)  # noqa: E712
            )
            company = company_result.scalar_one_or_none()
            if company is not None:
                return company.id, company.currency or "UGX"
        result = await db.execute(
            select(Company)
            .where(Company.is_active == True)  # noqa: E712
            .order_by(Company.created_at)
            .limit(1)
        )
        company = result.scalar_one_or_none()
        if company is not None:
            return company.id, company.currency or "UGX"
        return None, "UGX"
    if user.company_id is not None:
        company_result = await db.execute(select(Company).where(Company.id == user.company_id))
        company = company_result.scalar_one_or_none()
        return user.company_id, company.currency if company else "UGX"
    return None, "UGX"


def _company_id_str(company_id: _uuid.UUID | None) -> str | None:
    return str(company_id) if company_id else None


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_phone(db, data.phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is not active",
        )
    if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account locked due to too many failed attempts",
        )
    if not verify_pin(data.pin, user.hashed_pin):
        user.failed_login_attempts += 1
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    user.failed_login_attempts = 0
    user.pin_reset_otp = None
    user.pin_reset_otp_expires_at = None
    await db.flush()

    company_id, currency = await _effective_company(db, user)
    company_id_str = _company_id_str(company_id)
    permissions = sorted(await get_user_permissions(db, user))
    return TokenResponse(
        access_token=create_access_token(
            user.phone, role=user.role.value,
            can_backdate=user.can_backdate,
            company_id=company_id_str,
            currency=currency,
            permissions=permissions,
            name=user.name,
        ),
        refresh_token=create_refresh_token(user.phone, company_id=company_id_str),
    )


@router.post("/switch-company", response_model=TokenResponse)
async def switch_company(
    data: CompanySwitchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    """Switch the super admin's active operating company for this session."""
    try:
        cid = _uuid.UUID(data.company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID",
        )
    company_result = await db.execute(
        select(Company).where(Company.id == cid, Company.is_active == True)  # noqa: E712
    )
    company = company_result.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    company_id_str = str(cid)
    permissions = sorted(await get_user_permissions(db, current_user))
    return TokenResponse(
        access_token=create_access_token(
            current_user.phone, role=current_user.role.value,
            can_backdate=current_user.can_backdate,
            company_id=company_id_str,
            currency=company.currency or "UGX",
            permissions=permissions,
            name=current_user.name,
        ),
        refresh_token=create_refresh_token(current_user.phone, company_id=company_id_str),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    phone = payload.get("sub")
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user = await get_user_by_phone(db, phone)
    role = user.role.value if user else None
    preferred_id = None
    raw_cid = payload.get("company_id")
    if raw_cid:
        try:
            preferred_id = _uuid.UUID(raw_cid)
        except ValueError:
            preferred_id = None
    company_id, currency = await _effective_company(db, user, preferred_id=preferred_id) if user else (None, "UGX")
    company_id_str = _company_id_str(company_id)
    permissions: list[str] = []
    if user:
        permissions = sorted(await get_user_permissions(db, user))
    return TokenResponse(
        access_token=create_access_token(
            phone, role=role,
            can_backdate=user.can_backdate if user else False,
            company_id=company_id_str,
            currency=currency,
            permissions=permissions,
            name=user.name if user else None,
        ),
        refresh_token=create_refresh_token(phone, company_id=company_id_str),
    )


async def _resolve_sms_company_id(db, user):
    """Return the company_id to use for SMS delivery (default company for super users)."""
    if user.company_id:
        return user.company_id
    if user.role.value == "super_user":
        from sqlalchemy import select as sa_select
        from app.models.company import Company
        default_company_result = await db.execute(
            sa_select(Company).where(Company.is_active == True).limit(1)
        )
        default_company = default_company_result.scalar_one_or_none()
        if default_company:
            return default_company.id
    return None


@router.post("/forgot-pin", response_model=dict)
async def forgot_pin(data: PinResetRequest, db: AsyncSession = Depends(get_db)):
    user, otp = await user_service.request_pin_reset_otp(db, data.phone)
    if otp and user:
        sms_company_id = await _resolve_sms_company_id(db, user)
        if sms_company_id:
            await on_pin_reset_otp(db, sms_company_id, user.phone, user.name, otp)
    return {"message": "If the phone is registered, an OTP has been sent via SMS."}


@router.post("/forgot-pin/verify", response_model=dict)
async def verify_forgot_pin(data: PinResetVerifyRequest, db: AsyncSession = Depends(get_db)):
    try:
        await user_service.verify_pin_reset_otp(db, data.phone, data.otp, data.new_pin)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return {"message": "PIN reset successfully. You can now log in with your new PIN."}
