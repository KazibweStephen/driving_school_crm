"""add_vehicle_assignments — placeholder base for vehicles/scheduling branch

Creates tables that were originally created by now-missing migrations but
belong to this branch (before the chain merged with the lesson-plan branch).

Revision ID: 5a4b75598196
Revises:
Create Date: 2026-07-04 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '5a4b75598196'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Created here because no migration on either branch creates this table.
    # The branch_id FK is added later by a1b2c3d4e5f7.
    op.create_table('client_availabilities',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('client_phone', sa.String(20), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('preferred_lesson_time', sa.Time(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_client_availabilities_client_phone'), 'client_availabilities', ['client_phone'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_client_availabilities_client_phone'), table_name='client_availabilities')
    op.drop_table('client_availabilities')
