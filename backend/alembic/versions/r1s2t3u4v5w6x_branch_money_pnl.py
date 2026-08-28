"""branch money pools + pnl

Revision ID: r1s2t3u4v5w6x
Revises: q2r3s4t5u6v7w
Create Date: 2026-08-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as Uuid

revision = "r1s2t3u4v5w6x"
down_revision = "q2r3s4t5u6v7w"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New enum types
    transfer_pool = sa.Enum("petty_cash", "client_accounts", name="transferpool")
    transfer_method = sa.Enum("cash", "mobile_money", "bank", "other", name="transfermethod")
    transfer_pool.create(op.get_bind(), checkfirst=True)
    transfer_method.create(op.get_bind(), checkfirst=True)

    # Company: designated head office branch
    op.add_column("companies", sa.Column("head_office_branch_id", Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True))

    # Expense: link to attached client
    op.add_column("expenses", sa.Column("consultation_id", Uuid(as_uuid=True), sa.ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True, index=True))

    # BranchTransfer: pool / method / reference
    op.add_column("branch_transfers", sa.Column("pool", sa.Enum("petty_cash", "client_accounts", name="transferpool", create_type=False), nullable=True))
    op.add_column("branch_transfers", sa.Column("method", sa.Enum("cash", "mobile_money", "bank", "other", name="transfermethod", create_type=False), nullable=True))
    op.add_column("branch_transfers", sa.Column("reference", sa.String(200), nullable=True))

    # TransferPaymentLink M2M
    op.create_table(
        "transfer_payment_links",
        sa.Column("id", Uuid(as_uuid=True), primary_key=True),
        sa.Column("transfer_id", Uuid(as_uuid=True), sa.ForeignKey("branch_transfers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("payment_id", Uuid(as_uuid=True), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ExpenseCategory catalogue
    op.create_table(
        "expense_categories",
        sa.Column("id", Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("requires_client", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_operating", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "code", name="uq_expense_category_company_code"),
    )


def downgrade() -> None:
    op.drop_table("expense_categories")
    op.drop_table("transfer_payment_links")
    op.drop_column("branch_transfers", "reference")
    op.drop_column("branch_transfers", "method")
    op.drop_column("branch_transfers", "pool")
    op.drop_column("expenses", "consultation_id")
    op.drop_column("companies", "head_office_branch_id")
    sa.Enum(name="transfermethod").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="transferpool").drop(op.get_bind(), checkfirst=True)
