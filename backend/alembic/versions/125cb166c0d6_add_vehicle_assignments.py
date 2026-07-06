"""add_vehicle_assignments

Revision ID: 125cb166c0d6
Revises: 5a4b75598196
Create Date: 2026-07-04 19:05:35.104064

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '125cb166c0d6'
down_revision: Union[str, None] = '5a4b75598196'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('vehicle_assignments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('vehicle_id', sa.UUID(), nullable=False),
    sa.Column('instructor_id', sa.String(length=20), nullable=False),
    sa.Column('assigned_from', sa.Date(), nullable=False),
    sa.Column('assigned_until', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vehicle_assignments_vehicle_id'), 'vehicle_assignments', ['vehicle_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_vehicle_assignments_vehicle_id'), table_name='vehicle_assignments')
    op.drop_table('vehicle_assignments')
