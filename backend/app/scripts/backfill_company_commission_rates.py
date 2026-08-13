"""Idempotently backfill default commission schemes for already-seeded companies.

Reads the same bundled template (``app/data/seed_products.json``) used when a company
is first seeded. For every company, it finds packages that match the template by
(product name, package name, price) and creates a CommissionRate for any that do not
already have one linked (via ``commission_rate_packages``). Running it twice is a no-op
the second time.

Usage:
    docker compose exec backend bash -c 'cd /app && PYTHONPATH=/app python -m app.scripts.backfill_company_commission_rates'
"""
import asyncio
import json
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.database import async_session
from app.models.commission import CommissionRate, commission_rate_packages
from app.models.company import Company
from app.models.product import Package, Product

SEED_PRODUCTS_PATH = Path(__file__).resolve().parents[1] / "data" / "seed_products.json"


def load_seed_products() -> list[dict]:
    with open(SEED_PRODUCTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


async def backfill_company(db, company_id: uuid.UUID) -> tuple[int, int, int]:
    """Return (created_rates, linked_orphan_rates, skipped_already_linked) for one company."""
    template = load_seed_products()

    product_result = await db.execute(
        select(Product).where(Product.company_id == company_id)
    )
    products = list(product_result.scalars().all())

    package_result = await db.execute(
        select(Package)
        .options(joinedload(Package.product))
        .where(Package.product_id.in_([p.id for p in products]))
    )
    packages = package_result.unique().scalars().all()

    pkg_by_key = {
        (p.product.name, p.name, str(Decimal(p.price))): p
        for p in packages
    }

    # Load active rates for this company with their linked packages.
    today = date.today()
    rate_result = await db.execute(
        select(CommissionRate)
        .options(joinedload(CommissionRate.packages))
        .where(
            CommissionRate.company_id == company_id,
            CommissionRate.active_from <= today,
            (CommissionRate.active_until.is_(None) | (CommissionRate.active_until >= today)),
            CommissionRate.deactivated_at.is_(None),
        )
    )
    rates = list(rate_result.unique().scalars().all())

    linked_pkg_ids = set()
    orphan_rates = []
    for rate in rates:
        if rate.packages:
            for p in rate.packages:
                linked_pkg_ids.add(p.id)
        else:
            orphan_rates.append(rate)

    created = 0
    linked = 0
    skipped = 0
    for product_data in template:
        for pkg_data in product_data.get("packages", []):
            commission_data = pkg_data.get("commission")
            if not commission_data:
                continue
            key = (product_data["name"], pkg_data["name"], str(Decimal(pkg_data["price"])))
            pkg = pkg_by_key.get(key)
            if pkg is None:
                continue
            if pkg.id in linked_pkg_ids:
                skipped += 1
                continue

            # If an active rate exists with no package link, reuse/link it first.
            if orphan_rates:
                rate = orphan_rates.pop(0)
                rate.packages = [pkg]
                linked += 1
                linked_pkg_ids.add(pkg.id)
                continue

            rate = CommissionRate(
                company_id=company_id,
                total_amount=commission_data["total_amount"],
                converter_pct=commission_data["converter_pct"],
                primary_recommender_pct=commission_data.get("primary_recommender_pct", 0),
                secondary_recommender_pct=commission_data.get("secondary_recommender_pct", 0),
                active_from=date.today(),
                notes="Backfilled default scheme",
            )
            rate.packages = [pkg]
            db.add(rate)
            linked_pkg_ids.add(pkg.id)
            created += 1

    return created, linked, skipped


async def run() -> None:
    async with async_session() as db:
        result = await db.execute(select(Company).order_by(Company.name))
        companies = list(result.scalars().all())

        total_created = 0
        total_linked = 0
        for company in companies:
            created, linked, skipped = await backfill_company(db, company.id)
            total_created += created
            total_linked += linked
            print(
                f"  Company {company.id} ({company.name}): "
                f"created {created}, linked {linked}, already-linked/skipped {skipped}"
            )

        await db.commit()
        print(
            f"\nDone! {total_created} commission rate(s) created, "
            f"{total_linked} orphan rate(s) linked across {len(companies)} company/ies."
        )


if __name__ == "__main__":
    asyncio.run(run())
