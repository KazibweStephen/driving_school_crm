"""add expense_categories.requires_vehicle

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-09-23 12:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "expense_categories",
        sa.Column("requires_vehicle", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.execute("UPDATE expense_categories SET requires_vehicle = true WHERE code = 'fuel'")


def downgrade() -> None:
    op.drop_column("expense_categories", "requires_vehicle")