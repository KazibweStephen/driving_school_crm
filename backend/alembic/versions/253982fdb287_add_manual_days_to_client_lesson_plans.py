"""add_manual_days_to_client_lesson_plans

Revision ID: 253982fdb287
Revises: 9e593e98e7ad
Create Date: 2026-07-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '253982fdb287'
down_revision: Union[str, None] = '9e593e98e7ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"


def upgrade() -> None:
    op.add_column('client_lesson_plans', sa.Column('manual_days', sa.Integer(), nullable=True, server_default=sa.text('5')))
    op.alter_column('client_lesson_plans', 'manual_days', server_default=None)


def downgrade() -> None:
    op.drop_column('client_lesson_plans', 'manual_days')
