from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_user
from app.core.database import get_db
from app.models.product import EntityStatus
from app.models.user import User
from app.schemas.product import PackageCreate, PackageRead, PackageUpdate
from app.services import product as product_service

router = APIRouter(prefix="/packages", tags=["packages"])


@router.post("/", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
async def create_package(
    data: PackageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    product = await product_service.get_product_by_id(db, data.product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    pkg = await product_service.create_package(
        db,
        product_id=data.product_id,
        name=data.name,
        price=data.price,
        duration_label=data.duration_label,
        created_by_phone=current_user.phone,
        requires_driving_training=data.requires_driving_training,
        requires_theory_training=data.requires_theory_training,
        requires_permit_processing=data.requires_permit_processing,
        driving_training_duration_days=data.driving_training_duration_days,
        theory_training_hours=data.theory_training_hours,
        permit_processing_duration_days=data.permit_processing_duration_days,
    )
    return PackageRead.model_validate(pkg)


@router.patch("/{package_id}", response_model=PackageRead)
async def update_package(
    package_id: str,
    data: PackageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    pkg = await product_service.get_package_by_id(db, pid)
    if pkg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Package not found",
        )
    updated = await product_service.update_package(
        db,
        pkg,
        name=data.name,
        price=data.price,
        duration_label=data.duration_label,
        status=data.status,
        requires_driving_training=data.requires_driving_training,
        requires_theory_training=data.requires_theory_training,
        requires_permit_processing=data.requires_permit_processing,
        driving_training_duration_days=data.driving_training_duration_days,
        theory_training_hours=data.theory_training_hours,
        permit_processing_duration_days=data.permit_processing_duration_days,
    )
    return PackageRead.model_validate(updated)


@router.delete("/{package_id}", response_model=PackageRead)
async def deactivate_package(
    package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_user),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    pkg = await product_service.get_package_by_id(db, pid)
    if pkg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Package not found",
        )
    if pkg.status == EntityStatus.INACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Package is already inactive",
        )
    updated = await product_service.deactivate_package(db, pkg)
    return PackageRead.model_validate(updated)
