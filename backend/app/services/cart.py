import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem, CartItemStatus, follow_up_cart_items
from app.models.consultation import Consultation, FollowUp, FollowUpStatus, FollowUpType
from app.models.product import Package


async def add_cart_item(
    db: AsyncSession,
    consultation_id: uuid.UUID,
    product_id: str,
    package_id: str | None,
    notes: str | None,
    is_important: bool = False,
) -> CartItem:
    result = await db.execute(
        select(CartItem).where(
            CartItem.consultation_id == consultation_id,
            CartItem.product_id == product_id,
            CartItem.package_id == package_id,
        )
    )
    if result.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="This product is already in the cart")

    item = CartItem(
        consultation_id=consultation_id,
        product_id=product_id,
        package_id=package_id,
        notes=notes,
        is_important=is_important,
    )

    # Inherit training/permit fields from package
    if package_id:
        pkg = await db.get(Package, package_id)
        if pkg:
            item.requires_driving_training = pkg.requires_driving_training
            item.requires_theory_training = pkg.requires_theory_training
            item.requires_permit_processing = pkg.requires_permit_processing
            item.driving_training_duration_days = pkg.driving_training_duration_days
            item.theory_training_hours = pkg.theory_training_hours
            item.permit_processing_duration_days = pkg.permit_processing_duration_days

    db.add(item)
    await db.flush()
    await _update_consultation_status(db, consultation_id)
    return item


async def update_cart_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    status: str | None,
    notes: str | None,
    is_important: bool | None = None,
    recovery_reason: str | None = None,
) -> CartItem | None:
    result = await db.execute(select(CartItem).where(CartItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        return None

    old_status = item.status

    if status:
        new_status = CartItemStatus(status)

        # Recovering from lost requires a reason
        if old_status == CartItemStatus.LOST and new_status != CartItemStatus.LOST:
            if not recovery_reason:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Recovery reason is required when recovering a lost item")
            item.recovery_reason = recovery_reason

        item.status = new_status

    if notes is not None:
        item.notes = notes
    if is_important is not None:
        item.is_important = is_important
    await db.flush()

    # Auto-close follow-ups based on status change
    if status:
        if item.status in (CartItemStatus.CONVERTED, CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING):
            await _complete_conversion_follow_ups(db, item_id)
        elif item.status == CartItemStatus.LOST:
            await _cancel_follow_ups(db, item_id)

    await db.refresh(item)
    await _update_consultation_status(db, item.consultation_id)
    return item


async def remove_cart_item(db: AsyncSession, item_id: uuid.UUID) -> bool:
    result = await db.execute(select(CartItem).where(CartItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        return False
    if item.status in (CartItemStatus.CONVERTED, CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING):
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Cannot delete a converted product")
    consultation_id = item.consultation_id
    await db.delete(item)
    await db.flush()
    await _update_consultation_status(db, consultation_id)
    return True


async def get_cart_items(db: AsyncSession, consultation_id: uuid.UUID) -> list[CartItem]:
    result = await db.execute(
        select(CartItem)
        .where(CartItem.consultation_id == consultation_id)
        .order_by(CartItem.created_at)
    )
    return list(result.scalars().all())


async def _update_consultation_status(db: AsyncSession, consultation_id: uuid.UUID) -> None:
    from app.models.consultation import ConsultationStatus

    consultation = await db.get(Consultation, consultation_id)
    if not consultation:
        return

    # Never downgrade from a converted/client status
    if consultation.status in (
        ConsultationStatus.CONVERTED_NEW,
        ConsultationStatus.CONVERTED_UPSOLD,
        ConsultationStatus.CONVERTED_COMPLETED,
    ):
        return

    result = await db.execute(
        select(CartItem).where(CartItem.consultation_id == consultation_id)
    )
    items = list(result.scalars().all())

    _CONVERTED = (
        CartItemStatus.CONVERTED,
        CartItemStatus.CONVERTED_PAID,
        CartItemStatus.CONVERTED_PAYING,
    )

    if not items or all(i.status == CartItemStatus.LOST for i in items):
        consultation.status = ConsultationStatus.LOST
    elif all(i.status in _CONVERTED for i in items):
        consultation.status = ConsultationStatus.CONVERTED_COMPLETED
    elif any(i.status in _CONVERTED for i in items):
        consultation.status = ConsultationStatus.CONVERTED_NEW
    else:
        consultation.status = ConsultationStatus.ACTIVE

    await db.flush()


async def _complete_conversion_follow_ups(db: AsyncSession, cart_item_id: uuid.UUID) -> None:
    result = await db.execute(
        select(FollowUp)
        .join(follow_up_cart_items)
        .where(
            follow_up_cart_items.c.cart_item_id == cart_item_id,
            FollowUp.status == FollowUpStatus.PENDING,
            FollowUp.type == FollowUpType.CONVERSION,
        )
    )
    for fu in result.scalars().all():
        fu.status = FollowUpStatus.COMPLETED
    await db.flush()


async def _cancel_follow_ups(db: AsyncSession, cart_item_id: uuid.UUID) -> None:
    result = await db.execute(
        select(FollowUp)
        .join(follow_up_cart_items)
        .where(
            follow_up_cart_items.c.cart_item_id == cart_item_id,
            FollowUp.status == FollowUpStatus.PENDING,
        )
    )
    for fu in result.scalars().all():
        fu.status = FollowUpStatus.CANCELLED
    await db.flush()
