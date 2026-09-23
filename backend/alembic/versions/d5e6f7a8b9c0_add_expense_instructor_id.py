"""Add instructor_id FK to expenses for instructor-linked expenses

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "expenses",
        sa.Column("instructor_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_expenses_instructor_id",
        "expenses",
        "users",
        ["instructor_id"],
        ["phone"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_expenses_instructor_id", "expenses", type_="foreignkey")
    op.drop_column("expenses", "instructor_id")