"""Backfill consultations with NULL branch_id.

Consultations created via bulk onboarding (and some legacy paths) stored
branch_id = NULL, which made them invisible to every client list/search
endpoint (all company-scoped queries join Branch on
consultation.branch_id = branch.id, an inner join that drops NULL rows).

Bulk onboarding now requires a branch, so this is a one-time data backfill:
resolve each NULL-branch consultation's company via created_by_phone -> users,
falling back to the default company, then assign the first active branch of
that company.

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-08-10 12:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "u0v1w2x3y4z5"
down_revision = "t9u0v1w2x3y4"
branch_labels = None
depends_on = None

DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_BRANCH_ID = "00000000-0000-0000-0000-000000000002"


def upgrade() -> None:
    conn = op.get_bind()

    # Resolve each consultation's company via the creating user; fall back to
    # the default company when the creator is unknown or has no company.
    rows = conn.execute(
        sa.text("""
            SELECT c.id, COALESCE(u.company_id, :default_company) AS company_id
            FROM consultations c
            LEFT JOIN users u ON u.phone = c.created_by_phone
            WHERE c.branch_id IS NULL
        """),
        {"default_company": DEFAULT_COMPANY_ID},
    ).fetchall()

    updated = 0
    for consultation_id, company_id in rows:
        branch = conn.execute(
            sa.text("""
                SELECT id FROM branches
                WHERE company_id = :company_id AND is_active = true
                ORDER BY created_at
                LIMIT 1
            """),
            {"company_id": company_id},
        ).fetchone()
        branch_id = branch[0] if branch else DEFAULT_BRANCH_ID
        conn.execute(
            sa.text("UPDATE consultations SET branch_id = :branch_id WHERE id = :id"),
            {"branch_id": branch_id, "id": consultation_id},
        )
        updated += 1

    print(f"[backfill_null_branch_consultations] updated {updated} consultation(s)")


def downgrade() -> None:
    # Not reversible: previously-NULL rows can't be distinguished from rows that
    # legitimately have a branch.
    pass
