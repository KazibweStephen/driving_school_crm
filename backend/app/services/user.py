import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_pin, generate_otp, verify_pin
from app.models.company import Branch, Company, UserBranchAssignment
from app.models.user import User, UserRole, UserStatus, UserTransferHistory


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
        select(User)
        .options(
            selectinload(User.branch_assignments).selectinload(UserBranchAssignment.branch)
        )
        .where(User.phone == phone)
    )
    return result.scalar_one_or_none()


async def get_user_by_phone_with_company(
    db: AsyncSession,
    phone: str,
    company_id: uuid.UUID | None,
    current_user_role: UserRole | None = None,
) -> User | None:
    """Lookup user by phone, scoped to the user's effective company."""
    query = select(User).options(
        selectinload(User.branch_assignments).selectinload(UserBranchAssignment.branch)
    ).where(User.phone == phone)
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
    query = select(User).options(
        selectinload(User.branch_assignments).selectinload(UserBranchAssignment.branch)
    )

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


async def transfer_user_to_company(
    db: AsyncSession,
    user: User,
    target_company_id: uuid.UUID,
    target_branch_ids: list[uuid.UUID],
    reason: str | None,
    transferred_by_phone: str,
) -> UserTransferHistory:
    """Transfer a user to another company and record the change in history.

    Historical transactions remain with the original company because they are
    scoped through branch_id -> Branch.company_id, not the user's company_id.
    """
    if user.role == UserRole.SUPER_USER:
        raise ValueError("Cannot transfer super users between companies")

    if user.company_id == target_company_id:
        raise ValueError("User already belongs to the target company")

    target_company = await db.get(Company, target_company_id)
    if target_company is None:
        raise ValueError("Target company not found")
    if not target_company.is_active:
        raise ValueError("Target company is not active")

    if not target_branch_ids:
        raise ValueError("At least one target branch is required")

    # Validate all target branches belong to target company
    result = await db.execute(
        select(Branch).where(
            Branch.id.in_(target_branch_ids),
            Branch.company_id == target_company_id,
        )
    )
    valid_branches = {b.id for b in result.scalars().all()}
    invalid_ids = set(target_branch_ids) - valid_branches
    if invalid_ids:
        raise ValueError("One or more target branches do not belong to the target company")

    from_company_id = user.company_id
    if from_company_id is None:
        raise ValueError("User has no company to transfer from")

    from_branch_ids = [str(a.branch_id) for a in user.branch_assignments]
    role_before = user.role.value

    # Create audit record before mutating user
    history = UserTransferHistory(
        user_phone=user.phone,
        from_company_id=from_company_id,
        to_company_id=target_company_id,
        from_branch_ids=from_branch_ids,
        to_branch_ids=[str(b) for b in target_branch_ids],
        role_before=role_before,
        role_after=role_before,
        reason=reason,
        transferred_by=transferred_by_phone,
    )
    db.add(history)

    # Update user's company and branch assignments
    user.company_id = target_company_id
    await sync_user_branches(
        db, user.phone, list(target_branch_ids),
        company_id=target_company_id,
        current_user_role=UserRole.SUPER_USER,
    )

    await db.flush()
    await db.refresh(
        history,
        attribute_names=["from_company", "to_company", "transferred_by_user", "reversed_by_user"],
    )
    return history


async def reverse_user_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    reason: str | None,
    reversed_by_phone: str,
) -> UserTransferHistory:
    """Reverse a previous transfer, restoring the user's original company/branches."""
    result = await db.execute(
        select(UserTransferHistory).where(UserTransferHistory.id == transfer_id)
    )
    transfer = result.scalar_one_or_none()
    if transfer is None:
        raise ValueError("Transfer record not found")
    if transfer.is_reversed:
        raise ValueError("Transfer has already been reversed")

    user = await get_user_by_phone(db, transfer.user_phone)
    if user is None:
        raise ValueError("User not found")

    # Validate original company still exists and is active
    from_company = await db.get(Company, transfer.from_company_id)
    if from_company is None:
        raise ValueError("Original company no longer exists")
    if not from_company.is_active:
        raise ValueError("Original company is not active")

    # Validate original branches still exist and belong to original company
    original_branch_ids = transfer.from_branch_ids or []
    if original_branch_ids:
        result = await db.execute(
            select(Branch).where(
                Branch.id.in_(original_branch_ids),
                Branch.company_id == transfer.from_company_id,
            )
        )
        valid_branches = {b.id for b in result.scalars().all()}
        invalid_ids = set(original_branch_ids) - valid_branches
        if invalid_ids:
            raise ValueError("One or more original branches no longer exist or belong to the original company")

    # Restore user's company and branches
    user.company_id = transfer.from_company_id
    await sync_user_branches(
        db, user.phone, [uuid.UUID(b) for b in original_branch_ids],
        company_id=transfer.from_company_id,
        current_user_role=UserRole.SUPER_USER,
    )

    transfer.is_reversed = True
    transfer.reversed_by = reversed_by_phone
    transfer.reversed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(
        transfer,
        attribute_names=["from_company", "to_company", "transferred_by_user", "reversed_by_user"],
    )
    return transfer


async def get_user_transfer_history(
    db: AsyncSession,
    user_phone: str | None = None,
    company_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[UserTransferHistory], int]:
    query = select(UserTransferHistory).options(
        selectinload(UserTransferHistory.from_company),
        selectinload(UserTransferHistory.to_company),
        selectinload(UserTransferHistory.transferred_by_user),
        selectinload(UserTransferHistory.reversed_by_user),
    )

    if user_phone:
        query = query.where(UserTransferHistory.user_phone == user_phone)
    if company_id:
        query = query.where(
            or_(
                UserTransferHistory.from_company_id == company_id,
                UserTransferHistory.to_company_id == company_id,
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(UserTransferHistory.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total
