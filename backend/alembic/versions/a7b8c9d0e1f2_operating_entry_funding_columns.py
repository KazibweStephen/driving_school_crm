"""add funded_by and repay_from_profit to company_operating_entries

Revision ID: a7b8c9d0e1f2
Revises: b1c2d3e4f5a6
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = "a7b8c9d0e1f2"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "company_operating_entries",
        sa.Column("funded_by", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "company_operating_entries",
        sa.Column(
            "repay_from_profit",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column("company_operating_entries", "repay_from_profit")
    op.drop_column("company_operating_entries", "funded_by")
