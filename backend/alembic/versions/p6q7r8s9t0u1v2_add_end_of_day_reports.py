"""add end_of_day_reports

Revision ID: p6q7r8s9t0u1v2
Revises: o5p6q7r8s9t0u1
Create Date: 2026-09-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "p6q7r8s9t0u1v2"
down_revision: Union[str, None] = "o5p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "end_of_day_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("cash_at_hand", sa.Numeric(12, 2), nullable=False),
        sa.Column("consultations_count", sa.Integer(), nullable=False),
        sa.Column("new_clients_count", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("opening_cash", sa.Numeric(12, 2), nullable=False),
        sa.Column("cash_from_new_sales", sa.Numeric(12, 2), nullable=False),
        sa.Column("cash_from_collections", sa.Numeric(12, 2), nullable=False),
        sa.Column("cash_expenses", sa.Numeric(12, 2), nullable=False),
        sa.Column("cash_in", sa.Numeric(12, 2), nullable=False),
        sa.Column("cash_out", sa.Numeric(12, 2), nullable=False),
        sa.Column("net_cash", sa.Numeric(12, 2), nullable=False),
        sa.Column("expected_cash_at_hand", sa.Numeric(12, 2), nullable=False),
        sa.Column("variation", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_phone", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "report_date", name="uq_end_of_day_branch_date"),
    )
    op.create_index("ix_end_of_day_reports_branch_id", "end_of_day_reports", ["branch_id"])
    op.create_index("ix_end_of_day_reports_company_id", "end_of_day_reports", ["company_id"])
    op.create_index("ix_end_of_day_reports_report_date", "end_of_day_reports", ["report_date"])


def downgrade() -> None:
    op.drop_index("ix_end_of_day_reports_report_date", table_name="end_of_day_reports")
    op.drop_index("ix_end_of_day_reports_company_id", table_name="end_of_day_reports")
    op.drop_index("ix_end_of_day_reports_branch_id", table_name="end_of_day_reports")
    op.drop_table("end_of_day_reports")