"""add total_expenses + expense_variation to end_of_day_reports.

Chains from q7r8s9t0u1v2w3 (end-of-day permission backfill).
"""

import sqlalchemy as sa
from alembic import op

revision = "r8s9t0u1v2w3x4"
down_revision = "q7r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "end_of_day_reports",
        sa.Column(
            "total_expenses",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "end_of_day_reports",
        sa.Column(
            "expense_variation",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    # Existing reports were saved against the system-paid-expense figure, so
    # their entered total equals the system figure (expense variation = 0).
    op.execute(
        "UPDATE end_of_day_reports SET total_expenses = COALESCE(cash_expenses, 0), "
        "expense_variation = 0"
    )


def downgrade() -> None:
    op.drop_column("end_of_day_reports", "expense_variation")
    op.drop_column("end_of_day_reports", "total_expenses")