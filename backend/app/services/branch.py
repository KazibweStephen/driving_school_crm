import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Branch, Company

HEAD_OFFICE_NAME = "Head Office"
HEAD_OFFICE_CODE = "HEAD_OFFICE"


async def ensure_head_office_branch(
    db: AsyncSession, company_id: uuid.UUID
) -> Branch | None:
    """Return the company's Head Office branch, creating it if it does not exist.

    Idempotent: if the company already has a head office branch (either via
    ``head_office_branch_id`` or an existing branch named Head Office / coded
    HEAD_OFFICE), it is reused and pointed at. Otherwise a new branch is created
    and linked. Returns None if the company does not exist."""
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if company is None:
        return None

    branch = None
    if company.head_office_branch_id is not None:
        branch = (
            await db.execute(select(Branch).where(Branch.id == company.head_office_branch_id))
        ).scalar_one_or_none()
    if branch is None:
        branch = (
            await db.execute(
                select(Branch).where(
                    Branch.company_id == company_id,
                    Branch.name.ilike(HEAD_OFFICE_NAME),
                )
            ).scalars().first()
        )
    if branch is None:
        branch = (
            await db.execute(
                select(Branch).where(
                    Branch.company_id == company_id,
                    Branch.code == HEAD_OFFICE_CODE,
                )
            ).scalars().first()
        )
    if branch is None:
        branch = Branch(
            company_id=company_id,
            name=HEAD_OFFICE_NAME,
            code=HEAD_OFFICE_CODE,
            is_active=True,
        )
        db.add(branch)
        await db.flush()

    if company.head_office_branch_id != branch.id:
        company.head_office_branch_id = branch.id
        await db.flush()

    return branch


async def ensure_head_office_branches(db: AsyncSession) -> dict:
    """Backfill a Head Office branch for every company that lacks one (idempotent)."""
    companies = (await db.execute(select(Company.id))).scalars().all()
    created = 0
    for cid in companies:
        company = (
            await db.execute(select(Company).where(Company.id == cid))
        ).scalar_one_or_none()
        if company is not None and company.head_office_branch_id is None:
            before = company.head_office_branch_id
            await ensure_head_office_branch(db, cid)
            if company.head_office_branch_id != before:
                created += 1
    await db.flush()
    return {"created": created}
