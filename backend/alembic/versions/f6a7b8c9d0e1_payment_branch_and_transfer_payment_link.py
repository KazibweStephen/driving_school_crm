"""add payment branch + branch transfer payment link

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-31 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column(
            "branch_id",
            UUID,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_payments_branch_id", "payments", ["branch_id"])

    op.add_column(
        "branch_transfers",
        sa.Column(
            "payment_id",
            UUID,
            sa.ForeignKey("payments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_branch_transfers_payment_id", "branch_transfers", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_branch_transfers_payment_id", table_name="branch_transfers")
    op.drop_column("branch_transfers", "payment_id")
    op.drop_index("ix_payments_branch_id", table_name="payments")
    op.drop_column("payments", "branch_id")
