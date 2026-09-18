"""Add cart_item_id FK to expenses for permit stage linking

Revision ID: c4d5e6f7a8b9
Revises: z5a6b7c8d9e0
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa

revision = "c4d5e6f7a8b9"
down_revision = "z5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "expenses",
        sa.Column("cart_item_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_expenses_cart_item_id",
        "expenses",
        ["cart_item_id"],
    )
    op.create_foreign_key(
        "fk_expenses_cart_item_id",
        "expenses",
        "cart_items",
        ["cart_item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_expenses_cart_item_id", "expenses", type_="foreignkey")
    op.drop_index("ix_expenses_cart_item_id", table_name="expenses")
    op.drop_column("expenses", "cart_item_id")
