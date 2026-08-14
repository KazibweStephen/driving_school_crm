import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.product import EntityStatus, Package, Product
from app.models.commission import CommissionRate, commission_rate_packages


async def create_product(
    db: AsyncSession,
    name: str,
    duration_label: str | None,
    description: str | None,
    created_by_phone: str,
    company_id: uuid.UUID | None = None,
) -> Product:
    product = Product(
        name=name,
        duration_label=duration_label,
        description=description,
        created_by_phone=created_by_phone,
        company_id=company_id,
    )
    db.add(product)
    await db.flush()
    result = await db.execute(
        select(Product)
        .where(Product.id == product.id)
        .options(selectinload(Product.packages).selectinload(Package.commission_rates))
    )
    return result.scalar_one()


async def get_product_by_id(db: AsyncSession, product_id: uuid.UUID, company_id: uuid.UUID | None = None) -> Product | None:
    query = (
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.packages).selectinload(Package.commission_rates))
    )
    if company_id:
        query = query.where(Product.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_products(
    db: AsyncSession,
    search: str | None = None,
    status: EntityStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    company_id: uuid.UUID | None = None,
) -> tuple[list[Product], int]:
    query = (
        select(Product)
        .options(selectinload(Product.packages).selectinload(Package.commission_rates))
    )

    if company_id:
        query = query.where(Product.company_id == company_id)
    if search:
        query = query.where(Product.name.ilike(f"%{search}%"))
    if status:
        query = query.where(Product.status == status)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Product.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def update_product(
    db: AsyncSession,
    product: Product,
    name: str | None = None,
    duration_label: str | None = None,
    description: str | None = None,
    status: EntityStatus | None = None,
) -> Product:
    if name is not None:
        product.name = name
    if duration_label is not None:
        product.duration_label = duration_label
    if description is not None:
        product.description = description
    if status is not None:
        product.status = status
    await db.flush()
    result = await db.execute(
        select(Product)
        .where(Product.id == product.id)
        .options(selectinload(Product.packages).selectinload(Package.commission_rates))
    )
    return result.scalar_one()


async def deactivate_product(db: AsyncSession, product: Product) -> Product:
    product.status = EntityStatus.INACTIVE
    await db.flush()
    result = await db.execute(
        select(Product)
        .where(Product.id == product.id)
        .options(selectinload(Product.packages).selectinload(Package.commission_rates))
    )
    return result.scalar_one()


async def create_package_with_rate(
    db: AsyncSession,
    product_id: uuid.UUID,
    name: str,
    price: Decimal,
    created_by_phone: str,
    company_id: uuid.UUID | None = None,
    duration_label: str | None = None,
    requires_driving_training: bool = False,
    requires_theory_training: bool = False,
    requires_permit_processing: bool = False,
    driving_training_duration_days: int | None = None,
    theory_training_hours: int | None = None,
    permit_processing_duration_days: int | None = None,
    is_extension: bool = False,
    extension_days: int | None = None,
    # Commission rate fields (optional)
    rate_total_amount: Decimal | None = None,
    rate_converter_pct: Decimal | None = None,
    rate_primary_recommender_pct: Decimal = 0,
    rate_secondary_recommender_pct: Decimal = 0,
    rate_active_from: date | None = None,
    rate_active_until: date | None = None,
    rate_notes: str | None = None,
) -> Package:
    pkg = await create_package(
        db=db,
        product_id=product_id,
        name=name,
        price=price,
        duration_label=duration_label,
        created_by_phone=created_by_phone,
        requires_driving_training=requires_driving_training,
        requires_theory_training=requires_theory_training,
        requires_permit_processing=requires_permit_processing,
        driving_training_duration_days=driving_training_duration_days,
        theory_training_hours=theory_training_hours,
        permit_processing_duration_days=permit_processing_duration_days,
    )
    # Optionally create a commission rate
    if rate_total_amount is not None and rate_converter_pct is not None and company_id and rate_active_from:
        total = rate_converter_pct + rate_primary_recommender_pct + rate_secondary_recommender_pct
        if total != Decimal("100.00"):
            raise ValueError("Commission rate percentages must sum to 100")
        rate = CommissionRate(
            company_id=company_id,
            total_amount=rate_total_amount,
            converter_pct=rate_converter_pct,
            primary_recommender_pct=rate_primary_recommender_pct,
            secondary_recommender_pct=rate_secondary_recommender_pct,
            active_from=rate_active_from,
            active_until=rate_active_until,
            notes=rate_notes,
        )
        rate.packages = [pkg]
        db.add(rate)
        await db.flush()
    return pkg


async def create_package(
    db: AsyncSession,
    product_id: uuid.UUID,
    name: str,
    price: Decimal,
    duration_label: str | None,
    created_by_phone: str,
    requires_driving_training: bool = False,
    requires_theory_training: bool = False,
    requires_permit_processing: bool = False,
    driving_training_duration_days: int | None = None,
    theory_training_hours: int | None = None,
    permit_processing_duration_days: int | None = None,
) -> Package:
    pkg = Package(
        product_id=product_id,
        name=name,
        price=price,
        duration_label=duration_label,
        created_by_phone=created_by_phone,
        requires_driving_training=requires_driving_training,
        requires_theory_training=requires_theory_training,
        requires_permit_processing=requires_permit_processing,
        driving_training_duration_days=driving_training_duration_days,
        theory_training_hours=theory_training_hours,
        permit_processing_duration_days=permit_processing_duration_days,
    )
    db.add(pkg)
    await db.flush()
    await db.refresh(pkg)
    return pkg


async def get_package_by_id(db: AsyncSession, package_id: uuid.UUID, company_id: uuid.UUID | None = None) -> Package | None:
    query = (
        select(Package)
        .where(Package.id == package_id)
        .options(selectinload(Package.product), selectinload(Package.commission_rates))
    )
    if company_id:
        query = query.join(Package.product).where(Product.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_package(
    db: AsyncSession,
    pkg: Package,
    name: str | None = None,
    price: Decimal | None = None,
    duration_label: str | None = None,
    status: EntityStatus | None = None,
    requires_driving_training: bool | None = None,
    requires_theory_training: bool | None = None,
    requires_permit_processing: bool | None = None,
    driving_training_duration_days: int | None = None,
    theory_training_hours: int | None = None,
    permit_processing_duration_days: int | None = None,
) -> Package:
    if name is not None:
        pkg.name = name
    if price is not None:
        pkg.price = price
    if duration_label is not None:
        pkg.duration_label = duration_label
    if status is not None:
        pkg.status = status
    if requires_driving_training is not None:
        pkg.requires_driving_training = requires_driving_training
    if requires_theory_training is not None:
        pkg.requires_theory_training = requires_theory_training
    if requires_permit_processing is not None:
        pkg.requires_permit_processing = requires_permit_processing
    if driving_training_duration_days is not None:
        pkg.driving_training_duration_days = driving_training_duration_days
    if theory_training_hours is not None:
        pkg.theory_training_hours = theory_training_hours
    if permit_processing_duration_days is not None:
        pkg.permit_processing_duration_days = permit_processing_duration_days
    await db.flush()

    # Propagate training fields to all cart items referencing this package (no price change)
    from app.models.cart import CartItem
    from sqlalchemy import select
    result = await db.execute(
        select(CartItem).where(CartItem.package_id == pkg.id)
    )
    cart_items = result.scalars().all()
    for ci in cart_items:
        if requires_driving_training is not None:
            ci.requires_driving_training = requires_driving_training
        if requires_theory_training is not None:
            ci.requires_theory_training = requires_theory_training
        if requires_permit_processing is not None:
            ci.requires_permit_processing = requires_permit_processing
        if driving_training_duration_days is not None:
            ci.driving_training_duration_days = driving_training_duration_days
        if theory_training_hours is not None:
            ci.theory_training_hours = theory_training_hours
        if permit_processing_duration_days is not None:
            ci.permit_processing_duration_days = permit_processing_duration_days
    if cart_items:
        await db.flush()

    await db.refresh(pkg)
    return pkg


async def get_package_commission_rate(
    db: AsyncSession,
    package_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
) -> CommissionRate | None:
    """Return the most recent active commission rate linked to a package, if any."""
    from sqlalchemy import select as sa_select
    today = date.today()
    query = (
        sa_select(CommissionRate)
        .options(joinedload(CommissionRate.packages))
        .join(commission_rate_packages, CommissionRate.id == commission_rate_packages.c.commission_rate_id)
        .where(
            commission_rate_packages.c.package_id == package_id,
            CommissionRate.active_from <= today,
            CommissionRate.deactivated_at.is_(None),
            (CommissionRate.active_until.is_(None)) | (CommissionRate.active_until >= today),
        )
        .order_by(CommissionRate.created_at.desc())
        .limit(1)
    )
    if company_id:
        query = query.where(CommissionRate.company_id == company_id)
    result = await db.execute(query)
    return result.unique().scalar_one_or_none()


async def update_package_with_rate(
    db: AsyncSession,
    pkg: Package,
    company_id: uuid.UUID | None = None,
    name: str | None = None,
    price: Decimal | None = None,
    duration_label: str | None = None,
    status: EntityStatus | None = None,
    requires_driving_training: bool | None = None,
    requires_theory_training: bool | None = None,
    requires_permit_processing: bool | None = None,
    driving_training_duration_days: int | None = None,
    theory_training_hours: int | None = None,
    permit_processing_duration_days: int | None = None,
    rate_total_amount: Decimal | None = None,
    rate_converter_pct: Decimal | None = None,
    rate_primary_recommender_pct: Decimal | None = None,
    rate_secondary_recommender_pct: Decimal | None = None,
    rate_active_from: date | None = None,
    rate_active_until: date | None = None,
    rate_notes: str | None = None,
    clear_rate: bool = False,
) -> Package:
    await update_package(
        db, pkg,
        name=name,
        price=price,
        duration_label=duration_label,
        status=status,
        requires_driving_training=requires_driving_training,
        requires_theory_training=requires_theory_training,
        requires_permit_processing=requires_permit_processing,
        driving_training_duration_days=driving_training_duration_days,
        theory_training_hours=theory_training_hours,
        permit_processing_duration_days=permit_processing_duration_days,
    )

    if clear_rate:
        rate = await get_package_commission_rate(db, pkg.id, company_id=company_id)
        if rate:
            rate.deactivated_at = datetime.now(timezone.utc)
        await db.flush()
        return pkg

    if rate_total_amount is not None:
        converter = rate_converter_pct if rate_converter_pct is not None else Decimal("0")
        primary = rate_primary_recommender_pct if rate_primary_recommender_pct is not None else Decimal("0")
        secondary = rate_secondary_recommender_pct if rate_secondary_recommender_pct is not None else Decimal("0")
        if converter + primary + secondary != Decimal("100.00"):
            raise ValueError("Commission rate percentages must sum to 100")

        rate = await get_package_commission_rate(db, pkg.id, company_id=company_id)
        if rate:
            rate.total_amount = rate_total_amount
            rate.converter_pct = converter
            rate.primary_recommender_pct = primary
            rate.secondary_recommender_pct = secondary
            if rate_active_from is not None:
                rate.active_from = rate_active_from
            if rate_active_until is not None:
                rate.active_until = rate_active_until
            if rate_notes is not None:
                rate.notes = rate_notes
        else:
            if not company_id:
                raise ValueError("Company ID is required to create a commission rate")
            rate = CommissionRate(
                company_id=company_id,
                total_amount=rate_total_amount,
                converter_pct=converter,
                primary_recommender_pct=primary,
                secondary_recommender_pct=secondary,
                active_from=rate_active_from or date.today(),
                active_until=rate_active_until,
                notes=rate_notes,
            )
            rate.packages = [pkg]
            db.add(rate)
        await db.flush()

    return pkg


async def deactivate_package(db: AsyncSession, pkg: Package) -> Package:
    pkg.status = EntityStatus.INACTIVE
    await db.flush()
    result = await db.execute(
        select(Package)
        .where(Package.id == pkg.id)
        .options(selectinload(Package.commission_rates))
    )
    return result.scalar_one()
