"""add training permit fields

Revision ID: d3703c02aac6
Revises: b3c9d8e7f6a5
Create Date: 2026-06-21 10:09:19.117288

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3703c02aac6'
down_revision: Union[str, None] = 'b3c9d8e7f6a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('permit_progress',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('cart_item_id', sa.UUID(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('got_learners_permit_date', sa.Date(), nullable=True),
        sa.Column('learners_due_date', sa.Date(), nullable=True),
        sa.Column('learners_expiry_date', sa.Date(), nullable=True),
        sa.Column('tested_on_date', sa.Date(), nullable=True),
        sa.Column('expecting_permit_on_date', sa.Date(), nullable=True),
        sa.Column('delayed_days', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['cart_item_id'], ['cart_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permit_progress_cart_item_id'), 'permit_progress', ['cart_item_id'], unique=True)
    op.create_table('training_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('cart_item_id', sa.UUID(), nullable=False),
        sa.Column('session_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('theory_minutes', sa.Integer(), nullable=True),
        sa.Column('driving_minutes', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('instructor_notes', sa.Text(), nullable=True),
        sa.Column('lesson_plan_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['cart_item_id'], ['cart_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_sessions_cart_item_id'), 'training_sessions', ['cart_item_id'], unique=False)

    op.add_column('packages', sa.Column('requires_driving_training', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('packages', sa.Column('requires_theory_training', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('packages', sa.Column('requires_permit_processing', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('packages', sa.Column('driving_training_duration_days', sa.Integer(), nullable=True))
    op.add_column('packages', sa.Column('theory_training_hours', sa.Integer(), nullable=True))
    op.add_column('packages', sa.Column('permit_processing_duration_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('packages', 'permit_processing_duration_days')
    op.drop_column('packages', 'theory_training_hours')
    op.drop_column('packages', 'driving_training_duration_days')
    op.drop_column('packages', 'requires_permit_processing')
    op.drop_column('packages', 'requires_theory_training')
    op.drop_column('packages', 'requires_driving_training')
    op.drop_index(op.f('ix_training_sessions_cart_item_id'), table_name='training_sessions')
    op.drop_table('training_sessions')
    op.drop_index(op.f('ix_permit_progress_cart_item_id'), table_name='permit_progress')
    op.drop_table('permit_progress')
