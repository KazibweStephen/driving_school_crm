"""add per-package permit eligibility amounts + permit promises

Revision ID: b0c1d2e3f4a5
Revises: f7a8b9c0d1e2
Create Date: 2026-09-25 12:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "b0c1d2e3f4a5"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "packages",
        sa.Column("learners_permit_eligibility_amount", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "packages",
        sa.Column("test_eligibility_amount", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "cart_items",
        sa.Column("learners_permit_eligibility_amount", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "cart_items",
        sa.Column("test_eligibility_amount", sa.Numeric(12, 2), nullable=True),
    )

    # Backfill historic cart items with their package's current thresholds so
    # already-sold packages keep working with the 50%/100% eligibility defaults
    # until an admin adjusts the package (new sales snapshot at creation time).
    op.execute(
        """
        UPDATE cart_items ci
        SET learners_permit_eligibility_amount = p.learners_permit_eligibility_amount,
            test_eligibility_amount = p.test_eligibility_amount
        FROM packages p
        WHERE p.id::text = ci.package_id AND ci.package_id IS NOT NULL
        """
    )

    op.create_table(
        "permit_promises",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "cart_item_id",
            sa.Uuid(),
            sa.ForeignKey("cart_items.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("promised_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_phone", sa.String(36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("permit_promises")
    op.drop_column("cart_items", "test_eligibility_amount")
    op.drop_column("cart_items", "learners_permit_eligibility_amount")
    op.drop_column("packages", "test_eligibility_amount")
    op.drop_column("packages", "learners_permit_eligibility_amount")