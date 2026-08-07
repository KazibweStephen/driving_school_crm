import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_pin, generate_otp, verify_pin
from app.models.company import Branch, UserBranchAssignment
from app.models.user import User, UserRole, UserStatus


def generate_initial_pin() -> str:
    return f"{random.randint(0, 9999):04d}"


def split_name(name: str) -> tuple[str, str]:
    parts = (name or "").strip().split(maxsplit=1)
    first = parts[0] if parts else ""
    last = parts[1] if len(parts) > 1 else ""
    return first, last


async def sync_user_branches(
    db: AsyncSession,
    phone: str,
    branch_ids: list[uuid.UUID] | None,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> None:
    """Replace the user's branch assignments with the given set.

    Branch IDs are validated against the current user's company unless they are
    a SUPER_USER (who can assign across companies).
    """
    if branch_ids is None:
        return

    existing_result = await db.execute(
        select(UserBranchAssignment).where(UserBranchAssignment.user_id == phone)
    )
    existing = list(existing_result.scalars().all())
    existing_by_branch = {a.branch_id: a for a in existing}

    target_ids = set(branch_ids)

    for a in existing:
        if a.branch_id not in target_ids:
            await db.delete(a)

    if target_ids:
        query = select(Branch).where(Branch.id.in_(target_ids))
        if current_user_role != UserRole.SUPER_USER and company_id is not None:
            query = query.where(Branch.company_id == company_id)
        result = await db.execute(query)
        valid_branches = {b.id for b in result.scalars().all()}

        for bid in target_ids:
            if bid not in valid_branches:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=403,
                    detail="Branch not accessible in your company",
                )
            if bid not in existing_by_branch:
                db.add(UserBranchAssignment(user_id=phone, branch_id=bid))

    await db.flush()


async def create_user(
    db: AsyncSession,
    phone: str,
    name: str,
    role: UserRole,
    created_by_phone: str,
    first_name: str | None = None,
    last_name: str | None = None,
    is_company_admin: bool = False,
    company_id: uuid.UUID | None = None,
    can_backdate: bool = False,
) -> tuple[User, str]:
    initial_pin = generate_initial_pin()
    if first_name is not None or last_name is not None:
        name = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
    first, last = split_name(name)
    if first_name is not None:
        first = first_name.strip()
    if last_name is not None:
        last = last_name.strip()
    status = UserStatus.PENDING_APPROVAL if role == UserRole.COMPANY_SUPER_USER else UserStatus.ACTIVE
    user = User(
        phone=phone,
        name=name,
        first_name=first,
        last_name=last,
        role=role,
        hashed_pin=hash_pin(initial_pin),
        status=status,
        created_by_phone=created_by_phone,
        is_company_admin=is_company_admin,
        company_id=company_id,
        can_backdate=can_backdate,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user, initial_pin


async def get_user_by_phone(db: AsyncSession, phone: str) -> User | None:
    result = await db.execute(
        select(User).options(selectinload(User.branch_assignments)).where(User.phone == phone)
    )
    return result.scalar_one_or_none()


async def get_user_by_phone_with_company(
    db: AsyncSession,
    phone: str,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None = None,
) -> User | None:
    """Lookup user by phone, scoped to the user's effective company."""
    query = select(User).options(selectinload(User.branch_assignments)).where(User.phone == phone)
    if company_id is not None:
        query = query.where(User.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_users(
    db: AsyncSession,
    search: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> tuple[list[User], int]:
    query = select(User).options(selectinload(User.branch_assignments))

    if company_id is not None:
        query = query.where(User.company_id == company_id)

    if search:
        query = query.where(
            or_(
                User.name.ilike(f"%{search}%"),
                User.phone.ilike(f"%{search}%"),
            )
        )
    if role:
        query = query.where(User.role == role)
    if status:
        query = query.where(User.status == status)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def update_user(
    db: AsyncSession,
    user: User,
    name: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    is_company_admin: bool | None = None,
    company_id: uuid.UUID | None = None,
    can_backdate: bool | None = None,
) -> User:
    if first_name is not None or last_name is not None:
        first = first_name if first_name is not None else user.first_name
        last = last_name if last_name is not None else user.last_name
        user.first_name = first.strip()
        user.last_name = last.strip()
        name = f"{user.first_name} {user.last_name}".strip()
    if name is not None:
        user.name = name
    if role is not None:
        was_already_company_super_user = user.role == UserRole.COMPANY_SUPER_USER
        user.role = role
        if role == UserRole.COMPANY_SUPER_USER and not was_already_company_super_user and status is None:
            user.status = UserStatus.PENDING_APPROVAL
    if status is not None:
        user.status = status
    if is_company_admin is not None:
        user.is_company_admin = is_company_admin
    if company_id is not None:
        user.company_id = company_id
    if can_backdate is not None:
        user.can_backdate = can_backdate
    await db.flush()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, user: User) -> User:
    user.status = UserStatus.DEACTIVATED
    user.failed_login_attempts = 0
    await db.flush()
    await db.refresh(user)
    return user


async def activate_user(db: AsyncSession, user: User) -> User:
    user.status = UserStatus.ACTIVE
    user.failed_login_attempts = 0
    await db.flush()
    await db.refresh(user)
    return user


async def reset_user_pin(db: AsyncSession, user: User) -> tuple[User, str]:
    new_pin = generate_initial_pin()
    user.hashed_pin = hash_pin(new_pin)
    user.failed_login_attempts = 0
    user.pin_reset_otp = None
    user.pin_reset_otp_expires_at = None
    await db.flush()
    await db.refresh(user)
    return user, new_pin


async def change_user_pin(
    db: AsyncSession, user: User, old_pin: str, new_pin: str
) -> User:
    if not verify_pin(old_pin, user.hashed_pin):
        raise ValueError("Current PIN is incorrect")
    user.hashed_pin = hash_pin(new_pin)
    user.pin_reset_otp = None
    user.pin_reset_otp_expires_at = None
    await db.flush()
    return user


PIN_RESET_OTP_TTL_MINUTES = 10
PIN_RESET_RESEND_SECONDS = 60


async def request_pin_reset_otp(
    db: AsyncSession, phone: str
) -> tuple[User | None, str | None]:
    """Generate and store a PIN-reset OTP for the given phone.

    Returns ``(user, otp)``. ``otp`` is ``None`` when the account does not
    exist/is inactive (generic response to avoid enumeration) or when a code
    was sent within the last ``PIN_RESET_RESEND_SECONDS`` (rate limiting).
    """
    user = await get_user_by_phone(db, phone)
    if user is None or user.status != UserStatus.ACTIVE:
        return None, None
    now = datetime.now(timezone.utc)
    if user.pin_reset_otp and user.pin_reset_otp_expires_at:
        if user.pin_reset_otp_expires_at > now:
            last_sent = user.pin_reset_otp_expires_at - timedelta(minutes=PIN_RESET_OTP_TTL_MINUTES)
            if (now - last_sent).total_seconds() < PIN_RESET_RESEND_SECONDS:
                return user, None
    otp = generate_otp()
    user.pin_reset_otp = otp
    user.pin_reset_otp_expires_at = now + timedelta(minutes=PIN_RESET_OTP_TTL_MINUTES)
    await db.flush()
    return user, otp


async def verify_pin_reset_otp(
    db: AsyncSession, phone: str, otp: str, new_pin: str
) -> User:
    user = await get_user_by_phone(db, phone)
    if user is None or not user.pin_reset_otp or not user.pin_reset_otp_expires_at:
        raise ValueError("Invalid or expired OTP")
    if user.pin_reset_otp_expires_at < datetime.now(timezone.utc):
        raise ValueError("OTP has expired")
    if user.pin_reset_otp != otp:
        raise ValueError("Invalid OTP")
    user.hashed_pin = hash_pin(new_pin)
    user.pin_reset_otp = None
    user.pin_reset_otp_expires_at = None
    user.failed_login_attempts = 0
    await db.flush()
    return user
