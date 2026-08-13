"""Seed a company with products/packages from the bundled JSON template.

The template is a static export snapshot (see ``app/data/seed_products.json``) of the
products/packages that should be available to a newly created company. Seeding from the
JSON file means new companies do NOT depend on a specific source company existing.

Usage:
    docker compose exec backend python -m app.scripts.seed_company_products
"""
import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.database import async_session
from app.models.product import EntityStatus, Package, Product

SEED_PRODUCTS_PATH = Path(__file__).resolve().parents[1] / "data" / "seed_products.json"


def load_seed_products() -> list[dict]:
    """Load the bundled product seed template."""
    with open(SEED_PRODUCTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


async def seed_company_products_from_template(
    db,
    target_company_id: uuid.UUID,
    created_by_phone: str = "0782832711",
) -> int:
    """Seed products/packages from the bundled JSON template into a company.

    Only runs if the target company has no products yet (no-op otherwise).
    Returns the number of products created (0 when skipped).
    """
    existing = await db.execute(
        select(Product).where(Product.company_id == target_company_id).limit(1)
    )
    if existing.scalar_one_or_none():
        return 0

    data = load_seed_products()
    created_count = 0
    package_count = 0
    for product_data in data:
        new_product = Product(
            company_id=target_company_id,
            name=product_data["name"],
            duration_label=product_data.get("duration_label"),
            description=product_data.get("description"),
            status=EntityStatus(product_data.get("status", "active")),
            is_extension=product_data.get("is_extension", False),
            created_by_phone=created_by_phone,
        )
        db.add(new_product)
        await db.flush()
        created_count += 1

        for pkg_data in product_data.get("packages", []):
            new_pkg = Package(
                product_id=new_product.id,
                name=pkg_data["name"],
                price=pkg_data["price"],
                duration_label=pkg_data.get("duration_label"),
                requires_driving_training=pkg_data.get("requires_driving_training", False),
                requires_theory_training=pkg_data.get("requires_theory_training", False),
                requires_permit_processing=pkg_data.get("requires_permit_processing", False),
                driving_training_duration_days=pkg_data.get("driving_training_duration_days"),
                theory_training_hours=pkg_data.get("theory_training_hours"),
                permit_processing_duration_days=pkg_data.get("permit_processing_duration_days"),
                is_extension=pkg_data.get("is_extension", False),
                extension_days=pkg_data.get("extension_days"),
                status=EntityStatus(pkg_data.get("status", "active")),
                created_by_phone=created_by_phone,
            )
            db.add(new_pkg)
            package_count += 1

    await db.flush()
    print(
        f"  Seeded {created_count} product(s) and {package_count} package(s) "
        f"to company {target_company_id}."
    )
    return created_count


async def seed():
    async with async_session() as db:
        from app.models.company import Company

        result = await db.execute(select(Company))
        companies = list(result.scalars().all())

        for company in companies:
            print(f"\nSeeding products for company {company.id} ({company.name})...")
            await seed_company_products_from_template(db, company.id)

        await db.commit()
        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(seed())
