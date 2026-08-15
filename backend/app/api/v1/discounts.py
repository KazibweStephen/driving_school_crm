from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.discount import DiscountStatus
from app.models.user import User, UserRole
from app.schemas.discount import (
    ApplyDiscountRequest,
    CartItemDiscountRead,
    DiscountApprove,
    DiscountCreate,
    DiscountListResponse,
    DiscountNotificationResponse,
    DiscountRead,
    DiscountReject,
    DiscountUpdate,
    RemoveDiscountRequest,
)
from app.services import discount as discount_service

router = APIRouter(prefix="/discounts", tags=["discounts"])


def _to_read(discount, branch_name: str | None = None, requested_by_name: str | None = None) -> DiscountRead:
    data = DiscountRead.model_validate(discount)
    data.branch_name = branch_name or (discount.branch.name if discount.branch else None)
    data.requested_by_name = requested_by_name or (discount.requested_by_user.name if discount.requested_by_user else None)
    return data


@router.post("/", response_model=DiscountRead, status_code=status.HTTP_201_CREATED)
async def create_discount(
    data: DiscountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.create")),
):
    discount = await discount_service.create_discount(
        db,
        data.model_dump(),
        company_id=current_user.company_id,
        requested_by=current_user.phone,
    )
    return _to_read(discount)


@router.get("/", response_model=DiscountListResponse)
async def list_discounts(
    search: str | None = Query(None, max_length=50),
    status: DiscountStatus | None = None,
    branch_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.view")),
):
    company_id = current_user.company_id
    if current_user.role == UserRole.SUPER_USER and company_id is None:
        # Super users without an active company cannot list discounts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Switch to a company to view discounts",
        )
    discounts, total = await discount_service.list_discounts(
        db,
        company_id=company_id,
        search=search,
        status=status,
        branch_id=branch_id,
        page=page,
        page_size=page_size,
    )
    return DiscountListResponse(
        discounts=[_to_read(d) for d in discounts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/pending-for-approval", response_model=DiscountNotificationResponse)
async def pending_discount_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.view")),
):
    accessible_branch_ids = await discount_service.get_accessible_branch_ids(db, current_user)
    company_id = current_user.company_id
    discounts = await discount_service.get_pending_discount_notifications(
        db, company_id, accessible_branch_ids, limit
    )
    items = [
        {
            "id": d.id,
            "code": d.code,
            "name": d.name,
            "discount_type": d.discount_type.value,
            "discount_value": d.discount_value,
            "branch_id": d.branch_id,
            "branch_name": d.branch.name if d.branch else "",
            "requested_by": d.requested_by,
            "requested_by_name": d.requested_by_user.name if d.requested_by_user else "",
            "created_at": d.created_at,
        }
        for d in discounts
    ]
    return DiscountNotificationResponse(items=items, total=len(items))


@router.post("/apply", response_model=CartItemDiscountRead)
async def apply_discount(
    data: ApplyDiscountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.apply")),
):
    try:
        link = await discount_service.apply_discount_to_cart_item(
            db, data.discount_id, data.cart_item_id, current_user.phone, current_user.company_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return CartItemDiscountRead(
        id=link.id,
        cart_item_id=link.cart_item_id,
        discount_id=link.discount_id,
        discount_code=link.discount.code,
        discount_name=link.discount.name,
        applied_amount=link.applied_amount,
        applied_by=link.applied_by,
        applied_at=link.applied_at,
    )


@router.post("/remove", response_model=dict)
async def remove_discount(
    data: RemoveDiscountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.apply")),
):
    try:
        await discount_service.remove_discount_from_cart_item(
            db, data.cart_item_discount_id, current_user.company_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"message": "Discount removed from cart item"}


@router.get("/cart-item/{cart_item_id}", response_model=list[CartItemDiscountRead])
async def get_cart_item_discounts(
    cart_item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.view")),
):
    links = await discount_service.get_cart_item_discounts(db, cart_item_id)
    return [
        CartItemDiscountRead(
            id=link.id,
            cart_item_id=link.cart_item_id,
            discount_id=link.discount_id,
            discount_code=link.discount.code,
            discount_name=link.discount.name,
            applied_amount=link.applied_amount,
            applied_by=link.applied_by,
            applied_at=link.applied_at,
        )
        for link in links
    ]


@router.get("/applicable-for-product", response_model=list[DiscountRead])
async def get_applicable_discounts_for_product(
    product_id: UUID,
    package_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.view")),
):
    discounts = await discount_service.get_applicable_discounts_for_product(
        db, current_user.company_id, product_id, package_id
    )
    return [_to_read(d) for d in discounts]


@router.get("/applicable/{cart_item_id}", response_model=list[DiscountRead])
async def get_applicable_discounts(
    cart_item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.view")),
):
    from app.models.cart import CartItem

    cart_item = await db.get(CartItem, cart_item_id)
    if cart_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")

    discounts = await discount_service.get_applicable_discounts(
        db, current_user.company_id, cart_item
    )
    return [_to_read(d) for d in discounts]


@router.post("/expire", response_model=dict)
async def expire_discounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.manage")),
):
    count = await discount_service.expire_discounts(db)
    return {"expired": count}
@router.get("/{discount_id}", response_model=DiscountRead)
async def get_discount(
    discount_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.view")),
):
    company_id = current_user.company_id
    discount = await discount_service.get_discount(db, discount_id, company_id)
    if discount is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount not found")
    return _to_read(discount)


@router.patch("/{discount_id}", response_model=DiscountRead)
async def update_discount(
    discount_id: UUID,
    data: DiscountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.edit")),
):
    company_id = current_user.company_id
    discount = await discount_service.get_discount(db, discount_id, company_id)
    if discount is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount not found")
    try:
        discount = await discount_service.update_discount(db, discount, data.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_read(discount)


@router.post("/{discount_id}/approve", response_model=DiscountRead)
async def approve_discount(
    discount_id: UUID,
    data: DiscountApprove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.approve")),
):
    company_id = current_user.company_id
    discount = await discount_service.get_discount(db, discount_id, company_id)
    if discount is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount not found")
    try:
        discount = await discount_service.approve_discount(
            db, discount, current_user.phone, data.reason, current_user.role
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_read(discount)


@router.post("/{discount_id}/reject", response_model=DiscountRead)
async def reject_discount(
    discount_id: UUID,
    data: DiscountReject,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.reject")),
):
    company_id = current_user.company_id
    discount = await discount_service.get_discount(db, discount_id, company_id)
    if discount is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount not found")
    try:
        discount = await discount_service.reject_discount(
            db, discount, current_user.phone, data.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_read(discount)


@router.post("/{discount_id}/toggle-active", response_model=DiscountRead)
async def toggle_discount_active(
    discount_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("discounts.edit")),
):
    company_id = current_user.company_id
    discount = await discount_service.get_discount(db, discount_id, company_id)
    if discount is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount not found")
    try:
        discount = await discount_service.toggle_discount_active(db, discount)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_read(discount)


