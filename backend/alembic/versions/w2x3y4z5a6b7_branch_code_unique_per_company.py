"""Make branch code unique per company instead of globally unique.

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-08-11 00:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "w2x3y4z5a6b7"
down_revision = "v1w2x3y4z5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("branches_code_key", "branches", type_="unique")
    op.create_unique_constraint(
        "uq_branch_company_code", "branches", ["company_id", "code"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_branch_company_code", "branches", type_="unique")
    op.create_unique_constraint("branches_code_key", "branches", ["code"])
