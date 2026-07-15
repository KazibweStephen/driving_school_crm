import asyncio
import sys

from sqlalchemy import select, update

from app.core.database import async_session
from app.core.security import hash_pin
from app.models.user import User, UserRole, UserStatus


async def seed():
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.phone == "0782832711")
        )
        if result.scalar_one_or_none():
            print("Super user already exists, skipping seed.")
            return

        old = await db.execute(
            select(User).where(User.phone == "256700000000", User.role == UserRole.SUPER_USER)
        )
        old_user = old.scalar_one_or_none()
        if old_user:
            old_user.phone = "0782832711"
            await db.commit()
            print("Updated super user phone from 256700000000 to 0782832711")
            return

        user = User(
            phone="0782832711",
            name="Super Admin",
            role=UserRole.SUPER_USER,
            status=UserStatus.ACTIVE,
            hashed_pin=hash_pin("1234"),
        )
        db.add(user)
        await db.flush()
        await db.commit()
        print("Created super user: 0782832711 / PIN: 1234")


if __name__ == "__main__":
    asyncio.run(seed())
    sys.exit(0)
