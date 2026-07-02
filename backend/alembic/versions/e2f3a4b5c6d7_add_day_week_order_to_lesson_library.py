"""add day_number, week_number, order to lesson_library

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-06-24 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lesson_library', sa.Column('day_number', sa.Integer(), nullable=True))
    op.add_column('lesson_library', sa.Column('week_number', sa.Integer(), nullable=True))
    op.add_column('lesson_library', sa.Column('order', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('lesson_library', 'order')
    op.drop_column('lesson_library', 'week_number')
    op.drop_column('lesson_library', 'day_number')
