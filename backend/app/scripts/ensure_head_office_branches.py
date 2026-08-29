"""Ensure every company has a Head Office branch (idempotent backfill).

On company creation a Head Office branch is created automatically. For
pre-existing companies that predate this behaviour, this script creates a
"Head Office" branch (if one does not already exist) and points
``companies.head_office_branch_id`` at it. Re-running it is safe (no-op when
every company already has one).

Usage:
    docker compose exec backend python -m app.scripts.ensure_head_office_branches
"""
import asyncio

from sqlalchemy import select

from app.core.database import async_session
from app.models.company import Company
from app.services.branch import ensure_head_office_branch


async def run() -> dict:
    created = 0
    async with async_session() as db:
        companies = (await db.execute(select(Company))).scalars().all()
        for company in companies:
            before = company.head_office_branch_id
            await ensure_head_office_branch(db, company.id)
            if company.head_office_branch_id is not None and company.head_office_branch_id != before:
                created += 1
                print(f"  Created Head Office branch for {company.name} ({company.id})")
            elif company.head_office_branch_id is None:
                print(f"  !! Could not create Head Office branch for {company.name} ({company.id})")
        await db.commit()
    return {"created": created}


async def main():
    result = await run()
    print(f"Done. Created {result['created']} Head Office branch(es).")


if __name__ == "__main__":
    asyncio.run(main())
