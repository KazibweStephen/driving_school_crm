"""Add expense category requires_user + branch transfer dates + EOD transfers

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "expense_categories",
        sa.Column("requires_user", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("expense_categories", "requires_user", server_default=None)

    op.add_column(
        "branch_transfers",
        sa.Column("transfer_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "branch_transfers",
        sa.Column("received_date", sa.Date(), nullable=True),
    )
    op.create_index("ix_branch_transfers_transfer_date", "branch_transfers", ["transfer_date"])
    op.create_index("ix_branch_transfers_received_date", "branch_transfers", ["received_date"])

    op.add_column(
        "end_of_day_reports",
        sa.Column("transfers_received", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "end_of_day_reports",
        sa.Column("transfers_sent", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.alter_column("end_of_day_reports", "transfers_received", server_default=None)
    op.alter_column("end_of_day_reports", "transfers_sent", server_default=None)

    # Mark the Fuel category as requiring a user for existing companies.
    op.execute(
        "UPDATE expense_categories SET requires_user = true WHERE code = 'fuel'"
    )


def downgrade() -> None:
    op.drop_column("end_of_day_reports", "transfers_sent")
    op.drop_column("end_of_day_reports", "transfers_received")
    op.drop_index("ix_branch_transfers_received_date", table_name="branch_transfers")
    op.drop_index("ix_branch_transfers_transfer_date", table_name="branch_transfers")
    op.drop_column("branch_transfers", "received_date")
    op.drop_column("branch_transfers", "transfer_date")
    op.drop_column("expense_categories", "requires_user")