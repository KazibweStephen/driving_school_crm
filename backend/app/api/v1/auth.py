from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_pin,
)
from sqlalchemy import select

from app.models.company import Company
from app.models.user import UserStatus
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse
from app.services.user import get_user_by_phone

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_LOGIN_ATTEMPTS = 5


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

    company_id_str = str(user.company_id) if user.company_id else None
    currency = None
    if user.company_id:
        company_result = await db.execute(select(Company).where(Company.id == user.company_id))
        company = company_result.scalar_one_or_none()
        currency = company.currency if company else None
    return TokenResponse(
        access_token=create_access_token(
            user.phone, role=user.role.value,
            can_backdate=user.can_backdate,
            company_id=company_id_str,
            currency=currency,
        ),
        refresh_token=create_refresh_token(user.phone),
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
    company_id_str = str(user.company_id) if user and user.company_id else None
    currency = None
    if user and user.company_id:
        company_result = await db.execute(select(Company).where(Company.id == user.company_id))
        company = company_result.scalar_one_or_none()
        currency = company.currency if company else None
    return TokenResponse(
        access_token=create_access_token(
            phone, role=role,
            can_backdate=user.can_backdate if user else False,
            company_id=company_id_str,
            currency=currency,
        ),
        refresh_token=create_refresh_token(phone),
    )
