"""Backfill products with NULL company_id to the default company.

Products created by a super_user whose company_id is NULL were stored with
company_id = NULL, making them invisible to company-scoped users on the
mobile/desktop products lists (the tenant filter excludes NULL rows).
create_product now resolves a company via resolve_company_id, so this is a
one-time data backfill for rows created before that fix.

Revision ID: q5r6s7t8u9v0
Revises: o4p5q6r7s8t9u
Create Date: 2026-08-07 10:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "q5r6s7t8u9v0"
down_revision = "o4p5q6r7s8t9u"
branch_labels = None
depends_on = None

DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE products SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": DEFAULT_COMPANY_ID},
    )


def downgrade() -> None:
    # Not reversible: previously-NULL rows can't be distinguished from rows that
    # legitimately belong to the default company.
    pass
