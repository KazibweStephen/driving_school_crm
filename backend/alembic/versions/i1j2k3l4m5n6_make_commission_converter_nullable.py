"""make commission converter_id nullable

Revision ID: i1j2k3l4m5n6
Revises: h1i2j3k4l5m6
Create Date: 2026-07-15
"""
from alembic import op

revision = 'i1j2k3l4m5n6'
down_revision = 'h1i2j3k4l5m6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('commissions', 'converter_id', nullable=True)


def downgrade() -> None:
    op.alter_column('commissions', 'converter_id', nullable=False)
