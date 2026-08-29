"""add transfer receipt_url column

Adds a ``receipt_url`` column to ``branch_transfers`` so a transfer/remittance
can carry a scanned/uploaded receipt of the money movement.

Revision ID: u2v3w4x5y6z7a
Revises: t1u2v3w4x5y6z
Create Date: 2026-08-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "u2v3w4x5y6z7a"
down_revision: Union[str, None] = "t1u2v3w4x5y6z"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "branch_transfers",
        sa.Column("receipt_url", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("branch_transfers", "receipt_url")
