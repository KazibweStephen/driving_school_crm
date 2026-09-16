"""add test_date to permit_progress

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-09-16 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "z5a6b7c8d9e0"
down_revision = "y4z5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("permit_progress", sa.Column("test_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("permit_progress", "test_date")