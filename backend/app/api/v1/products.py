from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.product import EntityStatus
from app.models.user import User
from app.schemas.product import (
    PackageExpectedExpenseInput,
    PackageExpectedExpenseRead,
    ProductCreate,
    ProductListResponse,
    ProductRead,
    ProductUpdate,
)
from app.services import product as product_service
from app.utils.tenant import resolve_company_id

router = APIRouter(prefix="/products", tags=["products"])


@router.post("/", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.create")),
):
    company_id = await resolve_company_id(db, current_user)
    product = await product_service.create_product(
        db,
        name=data.name,
        duration_label=data.duration_label,
        description=data.description,
        created_by_phone=current_user.phone,
        company_id=company_id,
    )
    return ProductRead.model_validate(product)


@router.get("/", response_model=ProductListResponse)
async def list_products(
    search: str | None = Query(None, max_length=50),
    status: EntityStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.view")),
):
    products, total = await product_service.list_products(
        db,
        search=search,
        status=status,
        page=page,
        page_size=page_size,
        company_id=current_user.company_id,
    )
    return ProductListResponse(
        products=[ProductRead.model_validate(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.view")),
):
    from uuid import UUID
    try:
        pid = UUID(product_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid product ID",
        )
    product = await product_service.get_product_by_id(db, pid, company_id=current_user.company_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    return ProductRead.model_validate(product)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: str,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.edit")),
):
    from uuid import UUID
    try:
        pid = UUID(product_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid product ID",
        )
    product = await product_service.get_product_by_id(db, pid, company_id=current_user.company_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    updated = await product_service.update_product(
        db,
        product,
        name=data.name,
        duration_label=data.duration_label,
        description=data.description,
        status=data.status,
    )
    return ProductRead.model_validate(updated)


@router.delete("/{product_id}", response_model=ProductRead)
async def deactivate_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.delete")),
):
    from uuid import UUID
    try:
        pid = UUID(product_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid product ID",
        )
    product = await product_service.get_product_by_id(db, pid, company_id=current_user.company_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    if product.status == EntityStatus.INACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product is already inactive",
        )
    updated = await product_service.deactivate_product(db, product)
    return ProductRead.model_validate(updated)


@router.post(
    "/packages/{package_id}/expected-expenses",
    response_model=list[PackageExpectedExpenseRead],
    status_code=status.HTTP_200_OK,
)
async def set_package_expected_expenses(
    package_id: str,
    data: list[PackageExpectedExpenseInput],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.manage")),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    saved = await product_service.set_package_expected_expenses(
        db,
        pid,
        [{"category": d.category, "amount": d.amount} for d in data],
    )
    await db.commit()
    return [PackageExpectedExpenseRead.model_validate(e) for e in saved]
