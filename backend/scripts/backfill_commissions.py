"""Backfill commissions for converted cart items that are missing them."""
import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.cart import CartItem, CartItemStatus
from app.models.commission import Commission


async def backfill():
    async with async_session() as db:
        # Find all converted cart items without commissions
        result = await db.execute(
            select(CartItem)
            .where(CartItem.status.in_([
                CartItemStatus.CONVERTED,
                CartItemStatus.CONVERTED_PAID,
                CartItemStatus.CONVERTED_PAYING,
            ]))
        )
        items = result.scalars().all()

        created = 0
        skipped = 0
        for item in items:
            existing = await db.execute(
                select(Commission).where(Commission.cart_item_id == item.id)
            )
            if existing.scalar_one_or_none():
                continue

            from app.services.commission import create_commission_from_conversion
            commission = await create_commission_from_conversion(
                db, item, None,
                converter_id=None,
                recommender_id=None,
            )
            if commission:
                created += 1
                print(f"Created commission {commission.id} for cart_item {item.id} (rate={commission.total_amount})")
            else:
                skipped += 1
                print(f"Skipped cart_item {item.id} (package={item.package_id}, no matching rate)")

        await db.commit()
        print(f"\nDone: {created} created, {skipped} skipped (no matching commission rate)")


if __name__ == "__main__":
    asyncio.run(backfill())
