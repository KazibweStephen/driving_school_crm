"""permit audit log + eligibility override + new expense categories

Revision ID: y4z5a6b7c8d9
Revises: x1y2z3a4b5c6
Create Date: 2026-09-16 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as Uuid

revision = "y4z5a6b7c8d9"
down_revision = "x1y2z3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Eligibility override fields on permit_progress
    op.add_column("permit_progress", sa.Column("eligibility_overridden", sa.Boolean(), server_default="f", nullable=False))
    op.add_column("permit_progress", sa.Column("eligibility_override_reason", sa.Text(), nullable=True))

    # Audit log table
    op.create_table(
        "permit_audit_logs",
        sa.Column("id", Uuid(), primary_key=True),
        sa.Column("progress_id", Uuid(), sa.ForeignKey("permit_progress.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cart_item_id", Uuid(), sa.ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("field_changed", sa.String(80), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.String(36), nullable=True),
        sa.Column("changed_by_name", sa.String(200), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Seed new expense categories (Test Booking, Police Booking, IOV Fees)
    conn = op.get_bind()
    # Get all company IDs
    result = conn.execute(sa.text("SELECT id FROM companies"))
    company_ids = [row[0] for row in result.fetchall()]

    new_categories = [
        {"name": "Test Booking", "code": "test_booking", "requires_client": True, "is_operating": False, "account": "client_accounts", "sort_order": 12},
        {"name": "Police Booking", "code": "police_booking", "requires_client": True, "is_operating": False, "account": "client_accounts", "sort_order": 13},
        {"name": "IOV Fees", "code": "iov_fees", "requires_client": True, "is_operating": False, "account": "client_accounts", "sort_order": 14},
    ]
    for cid in company_ids:
        for cat in new_categories:
            conn.execute(
                sa.text(
                    "INSERT INTO expense_categories (id, company_id, name, code, requires_client, is_operating, account, sort_order) "
                    "VALUES (gen_random_uuid(), :company_id, :name, :code, :requires_client, :is_operating, :account, :sort_order) "
                    "ON CONFLICT DO NOTHING"
                ),
                {"company_id": cid, **cat},
            )


def downgrade() -> None:
    op.drop_table("permit_audit_logs")
    op.drop_column("permit_progress", "eligibility_override_reason")
    op.drop_column("permit_progress", "eligibility_overridden")
