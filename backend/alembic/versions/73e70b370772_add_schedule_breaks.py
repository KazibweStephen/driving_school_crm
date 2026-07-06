"""add_schedule_breaks

Revision ID: 73e70b370772
Revises: a1b2c3d4e5f7
Create Date: 2026-07-06 22:50:35.201325

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73e70b370772'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('schedule_breaks',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=False),
    sa.Column('end_time', sa.Time(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    # Seed default lunch break
    op.execute(
        sa.text(
            "INSERT INTO schedule_breaks (id, name, start_time, end_time, is_active) "
            "VALUES (:id, :name, :start_time, :end_time, :is_active)"
        ).bindparams(id=str(uuid.uuid4()), name="Lunch Break", start_time="13:00", end_time="13:30", is_active=True)
    )


def downgrade() -> None:
    op.drop_table('schedule_breaks')
