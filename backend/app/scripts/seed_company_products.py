"""Seed a new company with products/packages copied from a template company.

Usage:
    docker compose exec backend python -m app.scripts.seed_company_products
"""
import asyncio
import uuid

from sqlalchemy import select

from app.core.database import async_session
from app.models.company import Company
from app.models.product import Package, Product

SOURCE_COMPANY_CODE = "SEC2"


async def seed_company_products_from_template(
    db,
    target_company_id: uuid.UUID,
    source_company_code: str = SOURCE_COMPANY_CODE,
) -> bool:
    """Copy products and packages from the template company to the target company.

    Returns True if any products were copied.
    """
    existing = await db.execute(
        select(Product).where(Product.company_id == target_company_id).limit(1)
    )
    if existing.scalar_one_or_none():
        print(f"  Company {target_company_id} already has products, skipping.")
        return False

    source_result = await db.execute(
        select(Company).where(Company.code == source_company_code)
    )
    source = source_result.scalar_one_or_none()
    if not source:
        print(f"  Template company '{source_company_code}' not found, skipping product seed.")
        return False

    products_result = await db.execute(
        select(Product).where(Product.company_id == source.id)
    )
    source_products = list(products_result.scalars().all())
    if not source_products:
        print(f"  Template company '{source_company_code}' has no products, skipping.")
        return False

    packages_result = await db.execute(
        select(Package).where(
            Package.product_id.in_([p.id for p in source_products])
        )
    )
    source_packages = list(packages_result.scalars().all())
    packages_by_product: dict[uuid.UUID, list[Package]] = {}
    for pkg in source_packages:
        packages_by_product.setdefault(pkg.product_id, []).append(pkg)

    created_count = 0
    package_count = 0
    for src_product in source_products:
        new_product = Product(
            company_id=target_company_id,
            name=src_product.name,
            duration_label=src_product.duration_label,
            description=src_product.description,
            status=src_product.status,
            is_extension=src_product.is_extension,
            created_by_phone="0782832711",
        )
        db.add(new_product)
        await db.flush()
        created_count += 1

        for src_pkg in packages_by_product.get(src_product.id, []):
            new_pkg = Package(
                product_id=new_product.id,
                name=src_pkg.name,
                price=src_pkg.price,
                duration_label=src_pkg.duration_label,
                requires_driving_training=src_pkg.requires_driving_training,
                requires_theory_training=src_pkg.requires_theory_training,
                requires_permit_processing=src_pkg.requires_permit_processing,
                driving_training_duration_days=src_pkg.driving_training_duration_days,
                theory_training_hours=src_pkg.theory_training_hours,
                permit_processing_duration_days=src_pkg.permit_processing_duration_days,
                is_extension=src_pkg.is_extension,
                extension_days=src_pkg.extension_days,
                status=src_pkg.status,
                created_by_phone="0782832711",
            )
            db.add(new_pkg)
            package_count += 1

    await db.commit()
    print(
        f"  Seeded {created_count} product(s) and {package_count} package(s) "
        f"from '{source_company_code}' to company {target_company_id}."
    )
    return True


async def seed():
    async with async_session() as db:
        result = await db.execute(select(Company))
        companies = list(result.scalars().all())

        for company in companies:
            print(f"\nSeeding products for company {company.id} ({company.name})...")
            await seed_company_products_from_template(db, company.id)

        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(seed())
