"""add discount branch assignments

Revision ID: q2r3s4t5u6v7w
Revises: p1q2r3s4t5u6v
Create Date: 2026-08-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as Uuid

revision = "q2r3s4t5u6v7w"
down_revision = "p1q2r3s4t5u6v"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the new M2M table
    op.create_table(
        "discount_branch_assignments",
        sa.Column("id", Uuid(as_uuid=True), primary_key=True),
        sa.Column("discount_id", Uuid(as_uuid=True), sa.ForeignKey("discounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("branch_id", Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("discount_id", "branch_id", name="uq_discount_branch"),
    )

    # Migrate existing branch_id data to the new M2M table
    op.execute("""
        INSERT INTO discount_branch_assignments (id, discount_id, branch_id, created_at)
        SELECT gen_random_uuid(), id, branch_id, created_at
        FROM discounts
        WHERE branch_id IS NOT NULL
    """)

    # Make branch_id nullable on discounts table
    op.alter_column("discounts", "branch_id", nullable=True)


def downgrade() -> None:
    op.alter_column("discounts", "branch_id", nullable=False)
    op.drop_table("discount_branch_assignments")
