import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permit import PermitProgress


async def get_permit_progress(
    db: AsyncSession, cart_item_id: uuid.UUID
) -> PermitProgress | None:
    result = await db.execute(
        select(PermitProgress).where(PermitProgress.cart_item_id == cart_item_id)
    )
    return result.scalar_one_or_none()


async def upsert_permit_progress(
    db: AsyncSession,
    cart_item_id: uuid.UUID,
    start_date: date | None = None,
    got_learners_permit_date: date | None = None,
    learners_due_date: date | None = None,
    learners_expiry_date: date | None = None,
    tested_on_date: date | None = None,
    expecting_permit_on_date: date | None = None,
    delayed_days: int | None = None,
    notes: str | None = None,
) -> PermitProgress:
    existing = await get_permit_progress(db, cart_item_id)
    if existing:
        if start_date is not None:
            existing.start_date = start_date
        if got_learners_permit_date is not None:
            existing.got_learners_permit_date = got_learners_permit_date
        if learners_due_date is not None:
            existing.learners_due_date = learners_due_date
        if learners_expiry_date is not None:
            existing.learners_expiry_date = learners_expiry_date
        if tested_on_date is not None:
            existing.tested_on_date = tested_on_date
        if expecting_permit_on_date is not None:
            existing.expecting_permit_on_date = expecting_permit_on_date
        if delayed_days is not None:
            existing.delayed_days = delayed_days
        if notes is not None:
            existing.notes = notes
        await db.flush()
        await db.refresh(existing)
        return existing

    progress = PermitProgress(
        cart_item_id=cart_item_id,
        start_date=start_date,
        got_learners_permit_date=got_learners_permit_date,
        learners_due_date=learners_due_date,
        learners_expiry_date=learners_expiry_date,
        tested_on_date=tested_on_date,
        expecting_permit_on_date=expecting_permit_on_date,
        delayed_days=delayed_days,
        notes=notes,
    )
    db.add(progress)
    await db.flush()
    await db.refresh(progress)
    return progress
