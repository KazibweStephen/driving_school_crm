import asyncio
import sys

from sqlalchemy import select

from app.core.database import async_session
from app.core.security import hash_pin
from app.models.user import User, UserRole, UserStatus


async def seed():
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.phone == "256700000000")
        )
        if result.scalar_one_or_none():
            print("Super user already exists, skipping seed.")
            return

        user = User(
            phone="256700000000",
            name="Super Admin",
            role=UserRole.SUPER_USER,
            status=UserStatus.ACTIVE,
            hashed_pin=hash_pin("1234"),
        )
        db.add(user)
        await db.flush()
        await db.commit()
        print("Created super user: 256700000000 / PIN: 1234")


if __name__ == "__main__":
    asyncio.run(seed())
    sys.exit(0)
