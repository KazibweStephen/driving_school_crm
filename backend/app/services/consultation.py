import uuid
from datetime import date

from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem, CartItemStatus, follow_up_cart_items
from app.models.consultation import (
    Consultation,
    ConsultationStatus,
    FollowUp,
    FollowUpStatus,
    FollowUpType,
    InterestLevel,
)


async def create_consultation(
    db: AsyncSession,
    phone: str,
    first_name: str,
    middle_name: str | None = None,
    last_name: str | None = None,
    location: str | None = None,
    how_they_knew_us: str | None = None,
    interest_level: InterestLevel | None = None,
    interested_products: list | None = None,
    start_date: date | None = None,
    document_date: date | None = None,
    notes: str | None = None,
    branch_id: uuid.UUID | None = None,
    created_by_phone: str | None = None,
) -> Consultation:
    consultation = Consultation(
        phone=phone,
        first_name=first_name,
        middle_name=middle_name,
        last_name=last_name,
        location=location,
        how_they_knew_us=how_they_knew_us,
        interest_level=interest_level,
        interested_products=interested_products,
        start_date=start_date,
        document_date=document_date,
        notes=notes,
        branch_id=branch_id,
        created_by_phone=created_by_phone,
    )
    db.add(consultation)
    await db.flush()
    result = await db.execute(
        select(Consultation)
        .where(Consultation.id == consultation.id)
        .options(
            selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
            selectinload(Consultation.cart_items),
        )
    )
    return result.scalar_one()


async def get_consultation_by_id(
    db: AsyncSession, consultation_id: uuid.UUID, branch_id: uuid.UUID | None = None
) -> Consultation | None:
    query = (
        select(Consultation)
        .where(Consultation.id == consultation_id)
        .options(
            selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
            selectinload(Consultation.cart_items),
        )
    )
    if branch_id:
        query = query.where(Consultation.branch_id == branch_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def search_consultations(
    db: AsyncSession,
    search: str | None = None,
    status: ConsultationStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    exclude_converted: bool = False,
    stage: str | None = None,
    branch_id: uuid.UUID | None = None,
) -> tuple[list[Consultation], int]:
    query = select(Consultation).options(
        selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
        selectinload(Consultation.cart_items),
    )

    if branch_id:
        query = query.where(Consultation.branch_id == branch_id)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Consultation.phone.ilike(search_term),
                Consultation.first_name.ilike(search_term),
                Consultation.middle_name.ilike(search_term),
                Consultation.last_name.ilike(search_term),
            )
        )
    if status:
        query = query.where(Consultation.status == status)
    elif exclude_converted:
        query = query.where(
            ~Consultation.status.in_([
                ConsultationStatus.CONVERTED_NEW,
                ConsultationStatus.CONVERTED_UPSOLD,
                ConsultationStatus.CONVERTED_COMPLETED,
            ])
        )

    if stage:
        paid_consultations = select(CartItem.consultation_id).where(
            CartItem.status.in_([CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING])
        ).distinct().subquery()
        if stage == 'consulting':
            query = query.where(~Consultation.id.in_(select(paid_consultations.c.consultation_id)))
        elif stage == 'active':
            query = query.where(Consultation.id.in_(select(paid_consultations.c.consultation_id)))
        elif stage == 'completed':
            not_completed = select(CartItem.consultation_id).where(
                CartItem.status != CartItemStatus.CONVERTED_COMPLETED
            ).distinct().subquery()
            query = query.where(~Consultation.id.in_(select(not_completed.c.consultation_id)))
        elif stage == 'lost':
            not_lost = select(CartItem.consultation_id).where(
                CartItem.status != CartItemStatus.LOST
            ).distinct().subquery()
            query = query.where(~Consultation.id.in_(select(not_lost.c.consultation_id)))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Consultation.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def update_consultation(
    db: AsyncSession,
    consultation: Consultation,
    phone: str | None = None,
    first_name: str | None = None,
    middle_name: str | None = None,
    last_name: str | None = None,
    location: str | None = None,
    how_they_knew_us: str | None = None,
    interest_level: InterestLevel | None = None,
    interested_products: list | None = None,
    start_date: date | None = None,
    notes: str | None = None,
    status: ConsultationStatus | None = None,
) -> Consultation:
    if phone is not None:
        consultation.phone = phone
    if first_name is not None:
        consultation.first_name = first_name
    if middle_name is not None:
        consultation.middle_name = middle_name
    if last_name is not None:
        consultation.last_name = last_name
    if location is not None:
        consultation.location = location
    if how_they_knew_us is not None:
        consultation.how_they_knew_us = how_they_knew_us
    if interest_level is not None:
        consultation.interest_level = interest_level
    if interested_products is not None:
        consultation.interested_products = interested_products
    if start_date is not None:
        consultation.start_date = start_date
    if notes is not None:
        consultation.notes = notes
    if status is not None:
        consultation.status = status
    await db.flush()
    result = await db.execute(
        select(Consultation)
        .where(Consultation.id == consultation.id)
        .options(
            selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
            selectinload(Consultation.cart_items),
        )
    )
    return result.scalar_one()


async def deactivate_consultation(db: AsyncSession, consultation: Consultation) -> Consultation:
    consultation.status = ConsultationStatus.LOST
    await db.flush()
    result = await db.execute(
        select(Consultation)
        .where(Consultation.id == consultation.id)
        .options(
            selectinload(Consultation.follow_ups).selectinload(FollowUp.cart_items),
            selectinload(Consultation.cart_items),
        )
    )
    return result.scalar_one()


async def client_search(
    db: AsyncSession,
    search: str,
) -> list[dict]:
    """Search for unique clients by phone/name across all branches."""
    stmt = select(Consultation).options(selectinload(Consultation.follow_ups))
    search_term = f"%{search}%"
    stmt = stmt.where(
        or_(
            Consultation.phone.ilike(search_term),
            Consultation.first_name.ilike(search_term),
            Consultation.middle_name.ilike(search_term),
            Consultation.last_name.ilike(search_term),
        )
    ).order_by(Consultation.created_at.desc())

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    seen: dict[str, Consultation] = {}
    for c in rows:
        if c.phone not in seen:
            seen[c.phone] = c
    return list(seen.values())


async def create_follow_up(
    db: AsyncSession,
    consultation_id: uuid.UUID,
    follow_up_date: date,
    note: str | None = None,
    fu_type: FollowUpType = FollowUpType.CONVERSION,
    cart_item_ids: list[uuid.UUID] | None = None,
) -> FollowUp:
    if cart_item_ids:
        for ci_id in cart_item_ids:
            ci = await db.get(CartItem, ci_id)
            if ci:
                if ci.status in (CartItemStatus.LOST, CartItemStatus.CONVERTED, CartItemStatus.CONVERTED_PAID):
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot add follow-up for a {ci.status.value} product. Recover it first."
                    )
                if ci.status == CartItemStatus.CONVERTED_PAYING and fu_type != FollowUpType.PAYMENT:
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=400,
                        detail="Only payment follow-ups allowed for a paying product"
                    )

    fu = FollowUp(
        consultation_id=consultation_id,
        follow_up_date=follow_up_date,
        note=note,
        type=fu_type,
    )
    db.add(fu)
    await db.flush()

    if cart_item_ids:
        for ci_id in cart_item_ids:
            await db.execute(
                insert(follow_up_cart_items).values(
                    follow_up_id=fu.id, cart_item_id=ci_id
                )
            )
        await db.flush()

        for ci_id in cart_item_ids:
            count = await db.scalar(
                select(func.count()).select_from(follow_up_cart_items).where(
                    follow_up_cart_items.c.cart_item_id == ci_id
                )
            )
            if count and count > 1:
                ci = await db.get(CartItem, ci_id)
                if ci and ci.status == CartItemStatus.INTERESTED:
                    ci.status = CartItemStatus.CONSULTING

    await db.flush()
    await db.refresh(fu)
    return fu


async def list_follow_ups(
    db: AsyncSession, consultation_id: uuid.UUID
) -> list[FollowUp]:
    result = await db.execute(
        select(FollowUp)
        .where(FollowUp.consultation_id == consultation_id)
        .options(selectinload(FollowUp.cart_items))
        .order_by(FollowUp.follow_up_date.desc())
    )
    return list(result.scalars().all())


def follow_up_to_dict(fu: FollowUp) -> dict:
    """Convert FollowUp ORM to dict including cart_item_ids."""
    return {
        "id": fu.id,
        "consultation_id": fu.consultation_id,
        "follow_up_date": fu.follow_up_date,
        "note": fu.note,
        "status": fu.status,
        "type": fu.type,
        "cart_item_ids": [ci.id for ci in fu.cart_items] if fu.cart_items else [],
        "created_at": fu.created_at,
        "updated_at": fu.updated_at,
    }


async def get_follow_up_by_id(
    db: AsyncSession, follow_up_id: uuid.UUID
) -> FollowUp | None:
    result = await db.execute(
        select(FollowUp)
        .where(FollowUp.id == follow_up_id)
        .options(selectinload(FollowUp.cart_items))
    )
    return result.scalar_one_or_none()


async def update_follow_up(
    db: AsyncSession,
    fu: FollowUp,
    follow_up_date: date | None = None,
    note: str | None = None,
    status: FollowUpStatus | None = None,
    fu_type: FollowUpType | None = None,
    cart_item_ids: list[uuid.UUID] | None = None,
) -> FollowUp:
    if follow_up_date is not None:
        fu.follow_up_date = follow_up_date
    if note is not None:
        fu.note = note
    if status is not None:
        fu.status = status
    if fu_type is not None:
        fu.type = fu_type
    if cart_item_ids is not None:
        await db.execute(
            delete(follow_up_cart_items).where(follow_up_cart_items.c.follow_up_id == fu.id)
        )
        for ci_id in cart_item_ids:
            await db.execute(
                insert(follow_up_cart_items).values(follow_up_id=fu.id, cart_item_id=ci_id)
            )
    await db.flush()
    await db.refresh(fu)
    return fu


async def deactivate_follow_up(db: AsyncSession, fu: FollowUp) -> FollowUp:
    fu.status = FollowUpStatus.CANCELLED
    await db.flush()
    await db.refresh(fu)
    return fu
