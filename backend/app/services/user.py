import random

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_pin, generate_otp, verify_pin
from app.models.user import User, UserRole, UserStatus


def generate_initial_pin() -> str:
    return f"{random.randint(0, 9999):04d}"


async def create_user(
    db: AsyncSession,
    phone: str,
    name: str,
    role: UserRole,
    created_by_phone: str,
) -> tuple[User, str]:
    initial_pin = generate_initial_pin()
    user = User(
        phone=phone,
        name=name,
        role=role,
        hashed_pin=hash_pin(initial_pin),
        created_by_phone=created_by_phone,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user, initial_pin


async def get_user_by_phone(db: AsyncSession, phone: str) -> User | None:
    result = await db.execute(select(User).where(User.phone == phone))
    return result.scalar_one_or_none()


async def list_users(
    db: AsyncSession,
    search: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[User], int]:
    query = select(User)

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
    role: UserRole | None = None,
    status: UserStatus | None = None,
) -> User:
    if name is not None:
        user.name = name
    if role is not None:
        user.role = role
    if status is not None:
        user.status = status
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
