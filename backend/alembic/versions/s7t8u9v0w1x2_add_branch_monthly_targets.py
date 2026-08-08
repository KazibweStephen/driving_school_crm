"""Add branch_monthly_targets table.

Per-branch expected New Sales value for a given month. Used by the mobile
dashboard progress bar (falls back to companies.monthly_sales_target) and
managed from the web Branches page.

Revision ID: s7t8u9v0w1x2
Revises: r6s7t8u9v0w1
Create Date: 2026-08-08 09:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "s7t8u9v0w1x2"
down_revision = "r6s7t8u9v0w1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "branch_monthly_targets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("month", sa.Date(), nullable=False, index=True),
        sa.Column("target_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("branch_id", "month", name="uq_branch_monthly_target"),
    )


def downgrade() -> None:
    op.drop_table("branch_monthly_targets")
