import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.cart import CartItemCreate, CartItemRead, CartItemUpdate
from app.services import cart as cart_service

router = APIRouter(tags=["cart"])


@router.post(
    "/api/v1/consultations/{consultation_id}/cart-items",
    response_model=CartItemRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_cart_item(
    consultation_id: str,
    data: CartItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    item = await cart_service.add_cart_item(
        db, consultation_id=cid, product_id=data.product_id, package_id=data.package_id, notes=data.notes, is_important=data.is_important
    )
    return CartItemRead.model_validate(item)


@router.get(
    "/api/v1/consultations/{consultation_id}/cart-items",
    response_model=list[CartItemRead],
)
async def list_cart_items(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    items = await cart_service.get_cart_items(db, cid)
    return [CartItemRead.model_validate(i) for i in items]


@router.patch("/api/v1/cart-items/{item_id}", response_model=CartItemRead)
async def update_cart_item(
    item_id: str,
    data: CartItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    item = await cart_service.update_cart_item(db, item_id=iid, status=data.status, notes=data.notes, is_important=data.is_important, recovery_reason=data.recovery_reason)
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return CartItemRead.model_validate(item)


@router.delete("/api/v1/cart-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_cart_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    deleted = await cart_service.remove_cart_item(db, iid)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cart item not found")
