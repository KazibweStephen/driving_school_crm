import uuid
from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schedule_break import ScheduleBreak
from app.models.user import UserRole


async def list_breaks(
    db: AsyncSession,
    active_only: bool = False,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> list[ScheduleBreak]:
    query = select(ScheduleBreak)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.where(ScheduleBreak.company_id == company_id)
    if active_only:
        query = query.where(ScheduleBreak.is_active == True)
    query = query.order_by(ScheduleBreak.start_time)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_break(
    db: AsyncSession,
    break_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    current_user_role: UserRole | None = None,
) -> ScheduleBreak | None:
    query = select(ScheduleBreak).where(ScheduleBreak.id == break_id)
    if current_user_role != UserRole.SUPER_USER and company_id is not None:
        query = query.where(ScheduleBreak.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_break(
    db: AsyncSession,
    name: str,
    start_time: str,
    end_time: str,
    is_active: bool = True,
    is_standard: bool = False,
    company_id: uuid.UUID | None = None,
) -> ScheduleBreak:
    break_ = ScheduleBreak(
        name=name,
        start_time=time.fromisoformat(start_time),
        end_time=time.fromisoformat(end_time),
        is_active=is_active,
        is_standard=is_standard,
        company_id=company_id,
    )
    db.add(break_)
    await db.flush()
    await db.refresh(break_)
    return break_


async def update_break(
    db: AsyncSession,
    break_: ScheduleBreak,
    name: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    is_active: bool | None = None,
    is_standard: bool | None = None,
) -> ScheduleBreak:
    if name is not None:
        break_.name = name
    if start_time is not None:
        break_.start_time = time.fromisoformat(start_time)
    if end_time is not None:
        break_.end_time = time.fromisoformat(end_time)
    if is_active is not None:
        break_.is_active = is_active
    if is_standard is not None:
        break_.is_standard = is_standard
    await db.flush()
    await db.refresh(break_)
    return break_


async def delete_break(db: AsyncSession, break_: ScheduleBreak) -> None:
    await db.delete(break_)
    await db.flush()
