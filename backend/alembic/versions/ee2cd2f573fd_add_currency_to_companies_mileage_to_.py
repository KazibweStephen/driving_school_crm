"""add_currency_to_companies_mileage_to_expenses

Revision ID: ee2cd2f573fd
Revises: e713417c4b28
Create Date: 2026-07-07 13:32:08.774692

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee2cd2f573fd'
down_revision: Union[str, None] = 'e713417c4b28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('currency', sa.String(length=10), nullable=True))
    op.execute("UPDATE companies SET currency = 'USD' WHERE currency IS NULL")
    op.alter_column('companies', 'currency', nullable=False)
    op.add_column('expenses', sa.Column('mileage', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('expenses', 'mileage')
    op.drop_column('companies', 'currency')
