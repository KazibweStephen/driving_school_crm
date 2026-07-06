"""add_is_standard_to_schedule_breaks

Revision ID: 03340a0699ad
Revises: 73e70b370772
Create Date: 2026-07-06 23:07:09.905935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '03340a0699ad'
down_revision: Union[str, None] = '73e70b370772'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('schedule_breaks', sa.Column('is_standard', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.execute("UPDATE schedule_breaks SET is_standard = true WHERE name = 'Lunch Break' OR (start_time = '13:00:00' AND end_time = '13:30:00')")
    op.alter_column('schedule_breaks', 'is_standard', server_default=None)


def downgrade() -> None:
    op.drop_column('schedule_breaks', 'is_standard')
