from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.product import EntityStatus
from app.models.user import User
from app.schemas.fuel import (
    PackageFuelRateCreate,
    PackageFuelRateRead,
    PackageFuelRateUpdate,
)
from app.schemas.product import PackageCreate, PackageRead, PackageUpdate, PackageWithRateCreate, PackageWithRateUpdate
from app.schemas.commission import CommissionRateRead
from app.services import fuel as fuel_service
from app.services import product as product_service
from app.utils.tenant import resolve_company_id

router = APIRouter(prefix="/packages", tags=["packages"])


def _parse_uuid(value: str):
    from uuid import UUID
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID",
        )


def _to_package_fuel_rate_read(rate):
    return PackageFuelRateRead(
        id=rate.id,
        company_id=rate.company_id,
        package_id=rate.package_id,
        fuel_rate_per_session=rate.fuel_rate_per_session,
        active_from=rate.active_from,
        active_until=rate.active_until,
        deactivated_at=rate.deactivated_at,
        notes=rate.notes,
        created_at=rate.created_at,
        updated_at=rate.updated_at,
        package_name=rate.package.name if rate.package else None,
    )


@router.get("/{package_id}/fuel-rates", response_model=list[PackageFuelRateRead])
async def list_package_fuel_rates(
    package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("fuel.view")),
):
    pid = _parse_uuid(package_id)
    pkg = await product_service.get_package_by_id(db, pid, company_id=current_user.company_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    rates = await fuel_service.list_package_fuel_rates(db, pid, current_user.company_id)
    return [_to_package_fuel_rate_read(r) for r in rates]


@router.post("/{package_id}/fuel-rates", response_model=PackageFuelRateRead, status_code=status.HTTP_201_CREATED)
async def create_package_fuel_rate(
    package_id: str,
    data: PackageFuelRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("fuel.create")),
):
    pid = _parse_uuid(package_id)
    pkg = await product_service.get_package_by_id(db, pid, company_id=current_user.company_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    try:
        rate = await fuel_service.create_package_fuel_rate(
            db, company_id, pid, data.model_dump()
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_package_fuel_rate_read(rate)


@router.patch("/{package_id}/fuel-rates/{rate_id}", response_model=PackageFuelRateRead)
async def update_package_fuel_rate(
    package_id: str,
    rate_id: str,
    data: PackageFuelRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("fuel.edit")),
):
    pid = _parse_uuid(package_id)
    rid = _parse_uuid(rate_id)
    pkg = await product_service.get_package_by_id(db, pid, company_id=current_user.company_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    rate = await fuel_service.get_package_fuel_rate_by_id(db, rid, current_user.company_id)
    if rate is None or rate.package_id != pid:
        raise HTTPException(status_code=404, detail="Fuel rate not found")
    try:
        rate = await fuel_service.update_package_fuel_rate(
            db, rate, data.model_dump(exclude_unset=True)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_package_fuel_rate_read(rate)


@router.delete("/{package_id}/fuel-rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_package_fuel_rate(
    package_id: str,
    rate_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("fuel.delete")),
):
    pid = _parse_uuid(package_id)
    rid = _parse_uuid(rate_id)
    pkg = await product_service.get_package_by_id(db, pid, company_id=current_user.company_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    rate = await fuel_service.get_package_fuel_rate_by_id(db, rid, current_user.company_id)
    if rate is None or rate.package_id != pid:
        raise HTTPException(status_code=404, detail="Fuel rate not found")
    await fuel_service.delete_package_fuel_rate(db, rate)


@router.post("/with-rate", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
async def create_package_with_rate(
    data: PackageWithRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.create")),
):
    product = await product_service.get_product_by_id(db, data.product_id, company_id=current_user.company_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    company_id = await resolve_company_id(db, current_user)
    try:
        pkg = await product_service.create_package_with_rate(
            db,
            product_id=data.product_id,
            name=data.name,
            price=data.price,
            duration_label=data.duration_label,
            created_by_phone=current_user.phone,
            company_id=company_id,
            requires_driving_training=data.requires_driving_training,
            requires_theory_training=data.requires_theory_training,
            requires_permit_processing=data.requires_permit_processing,
            driving_training_duration_days=data.driving_training_duration_days,
            theory_training_hours=data.theory_training_hours,
            permit_processing_duration_days=data.permit_processing_duration_days,
            is_extension=data.is_extension,
            extension_days=data.extension_days,
            rate_total_amount=data.rate_total_amount,
            rate_converter_pct=data.rate_converter_pct,
            rate_primary_recommender_pct=data.rate_primary_recommender_pct,
            rate_secondary_recommender_pct=data.rate_secondary_recommender_pct,
            rate_active_from=data.rate_active_from,
            rate_active_until=data.rate_active_until,
            rate_notes=data.rate_notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PackageRead.model_validate(pkg)


@router.post("/", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
async def create_package(
    data: PackageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.create")),
):
    product = await product_service.get_product_by_id(db, data.product_id, company_id=current_user.company_id)
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
    current_user: User = Depends(require_permission("products.edit")),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    pkg = await product_service.get_package_by_id(db, pid, company_id=current_user.company_id)
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


def _to_commission_rate_read(rate) -> CommissionRateRead:
    return CommissionRateRead(
        id=rate.id,
        company_id=rate.company_id,
        package_ids=[p.id for p in (rate.packages or [])],
        total_amount=rate.total_amount,
        converter_pct=rate.converter_pct,
        primary_recommender_pct=rate.primary_recommender_pct,
        secondary_recommender_pct=rate.secondary_recommender_pct,
        active_from=rate.active_from,
        active_until=rate.active_until,
        deactivated_at=rate.deactivated_at,
        notes=rate.notes,
        created_at=rate.created_at,
        updated_at=rate.updated_at,
        package_names=[p.name for p in (rate.packages or [])],
    )


@router.get("/{package_id}/commission-rate", response_model=CommissionRateRead | None)
async def get_package_commission_rate(
    package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.view")),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    scope_company = None if current_user.role == "super_user" else current_user.company_id
    pkg = await product_service.get_package_by_id(db, pid, company_id=scope_company)
    if pkg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Package not found",
        )
    rate = await product_service.get_package_commission_rate(db, pid, company_id=scope_company)
    if not rate:
        return None
    return _to_commission_rate_read(rate)


@router.patch("/{package_id}/with-rate", response_model=PackageRead)
async def update_package_with_rate(
    package_id: str,
    data: PackageWithRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.edit")),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    scope_company = None if current_user.role == "super_user" else current_user.company_id
    pkg = await product_service.get_package_by_id(db, pid, company_id=scope_company)
    if pkg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Package not found",
        )
    company_id = pkg.product.company_id if pkg.product else await resolve_company_id(db, current_user)
    try:
        updated = await product_service.update_package_with_rate(
            db,
            pkg,
            company_id=company_id,
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
            rate_total_amount=data.rate_total_amount,
            rate_converter_pct=data.rate_converter_pct,
            rate_primary_recommender_pct=data.rate_primary_recommender_pct,
            rate_secondary_recommender_pct=data.rate_secondary_recommender_pct,
            rate_active_from=data.rate_active_from,
            rate_active_until=data.rate_active_until,
            rate_notes=data.rate_notes,
            clear_rate=data.clear_rate,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PackageRead.model_validate(updated)


@router.delete("/{package_id}", response_model=PackageRead)
async def deactivate_package(
    package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("products.delete")),
):
    from uuid import UUID
    try:
        pid = UUID(package_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid package ID",
        )
    pkg = await product_service.get_package_by_id(db, pid, company_id=current_user.company_id)
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
