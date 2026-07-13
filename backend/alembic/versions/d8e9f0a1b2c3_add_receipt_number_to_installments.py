"""add_receipt_number_to_installments

Revision ID: d8e9f0a1b2c3
Revises: f5e6d7c8b9a0
Create Date: 2026-07-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = ('7fdead775930', 'bf9b0d9b2c8f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('installments', sa.Column('receipt_number', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('installments', 'receipt_number')
