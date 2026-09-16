"""add_permit_tracking_flags

Revision ID: x1y2z3a4b5c6
Revises: s9t0u1v2w3x4y
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'x1y2z3a4b5c6'
down_revision = 's9t0u1v2w3x4y'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('permit_progress', sa.Column('learners_permit_photo_url', sa.String(length=500), nullable=True))
    op.add_column('permit_progress', sa.Column('test_ready', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('permit_progress', sa.Column('waiting_for_permit', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('permit_progress', sa.Column('permit_paid', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('permit_progress', sa.Column('permit_received_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('permit_progress', 'permit_received_date')
    op.drop_column('permit_progress', 'permit_paid')
    op.drop_column('permit_progress', 'waiting_for_permit')
    op.drop_column('permit_progress', 'test_ready')
    op.drop_column('permit_progress', 'learners_permit_photo_url')