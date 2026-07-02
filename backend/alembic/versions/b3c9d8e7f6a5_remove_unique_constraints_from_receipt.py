"""remove unique constraints from receipt fields

Revision ID: b3c9d8e7f6a5
Revises: edf1f5deb926
Create Date: 2026-06-16 14:15:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3c9d8e7f6a5'
down_revision: Union[str, None] = 'edf1f5deb926'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove unique constraint from receipt_number
    op.drop_constraint('payments_receipt_number_key', 'payments', type_='unique')
    # Remove unique constraint from system_receipt_number
    op.drop_constraint('payments_system_receipt_number_key', 'payments', type_='unique')


def downgrade() -> None:
    # Re-add unique constraints
    op.create_unique_constraint('payments_system_receipt_number_key', 'payments', ['system_receipt_number'])
    op.create_unique_constraint('payments_receipt_number_key', 'payments', ['receipt_number'])
