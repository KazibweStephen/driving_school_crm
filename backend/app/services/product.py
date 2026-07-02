import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import EntityStatus, Package, Product


async def create_product(
    db: AsyncSession,
    name: str,
    duration_label: str | None,
    description: str | None,
    created_by_phone: str,
) -> Product:
    product = Product(
        name=name,
        duration_label=duration_label,
        description=description,
        created_by_phone=created_by_phone,
    )
    db.add(product)
    await db.flush()
    result = await db.execute(
        select(Product).where(Product.id == product.id).options(selectinload(Product.packages))
    )
    return result.scalar_one()


async def get_product_by_id(db: AsyncSession, product_id: uuid.UUID) -> Product | None:
    result = await db.execute(
        select(Product).where(Product.id == product_id).options(selectinload(Product.packages))
    )
    return result.scalar_one_or_none()


async def list_products(
    db: AsyncSession,
    search: str | None = None,
    status: EntityStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Product], int]:
    query = select(Product).options(selectinload(Product.packages))

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
        select(Product).where(Product.id == product.id).options(selectinload(Product.packages))
    )
    return result.scalar_one()


async def deactivate_product(db: AsyncSession, product: Product) -> Product:
    product.status = EntityStatus.INACTIVE
    await db.flush()
    result = await db.execute(
        select(Product).where(Product.id == product.id).options(selectinload(Product.packages))
    )
    return result.scalar_one()


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


async def get_package_by_id(db: AsyncSession, package_id: uuid.UUID) -> Package | None:
    result = await db.execute(select(Package).where(Package.id == package_id))
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
    await db.refresh(pkg)
    return pkg


async def deactivate_package(db: AsyncSession, pkg: Package) -> Package:
    pkg.status = EntityStatus.INACTIVE
    await db.flush()
    await db.refresh(pkg)
    return pkg
