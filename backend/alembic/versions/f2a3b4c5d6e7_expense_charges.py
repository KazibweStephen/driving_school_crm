"""add charges columns to expenses

Revision ID: f2a3b4c5d6e7
Revises: a7b8c9d0e1f2
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = "f2a3b4c5d6e7"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "expenses",
        sa.Column("charges", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.add_column(
        "expenses",
        sa.Column("paid_charges", sa.Numeric(12, 2), nullable=True),
    )


def downgrade():
    op.drop_column("expenses", "paid_charges")
    op.drop_column("expenses", "charges")