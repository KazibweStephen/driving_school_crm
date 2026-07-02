"""add training permit fields to cart items

Revision ID: fd36e62dd528
Revises: d3703c02aac6
Create Date: 2026-06-21 10:44:21.924606

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fd36e62dd528'
down_revision: Union[str, None] = 'd3703c02aac6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add as nullable first, populate defaults, then set NOT NULL
    op.add_column('cart_items', sa.Column('requires_driving_training', sa.Boolean(), nullable=True))
    op.add_column('cart_items', sa.Column('requires_theory_training', sa.Boolean(), nullable=True))
    op.add_column('cart_items', sa.Column('requires_permit_processing', sa.Boolean(), nullable=True))
    op.add_column('cart_items', sa.Column('driving_training_duration_days', sa.Integer(), nullable=True))
    op.add_column('cart_items', sa.Column('theory_training_hours', sa.Integer(), nullable=True))
    op.add_column('cart_items', sa.Column('permit_processing_duration_days', sa.Integer(), nullable=True))

    op.execute("UPDATE cart_items SET requires_driving_training = FALSE WHERE requires_driving_training IS NULL")
    op.execute("UPDATE cart_items SET requires_theory_training = FALSE WHERE requires_theory_training IS NULL")
    op.execute("UPDATE cart_items SET requires_permit_processing = FALSE WHERE requires_permit_processing IS NULL")

    op.alter_column('cart_items', 'requires_driving_training', nullable=False)
    op.alter_column('cart_items', 'requires_theory_training', nullable=False)
    op.alter_column('cart_items', 'requires_permit_processing', nullable=False)


def downgrade() -> None:
    op.drop_column('cart_items', 'permit_processing_duration_days')
    op.drop_column('cart_items', 'theory_training_hours')
    op.drop_column('cart_items', 'driving_training_duration_days')
    op.drop_column('cart_items', 'requires_permit_processing')
    op.drop_column('cart_items', 'requires_theory_training')
    op.drop_column('cart_items', 'requires_driving_training')
