"""Add converter/recommender columns to cart_items.

Capture who converted / recommended a product at consult-and-sell time so that
a commission created later (when the item converts) can reference the right
people without re-entering them.

Revision ID: r6s7t8u9v0w1
Revises: q5r6s7t8u9v0
Create Date: 2026-08-07 21:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "r6s7t8u9v0w1"
down_revision = "q5r6s7t8u9v0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cart_items",
        sa.Column("converter_id", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
    )
    op.add_column(
        "cart_items",
        sa.Column("primary_recommender_id", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
    )
    op.add_column(
        "cart_items",
        sa.Column("secondary_recommender_id", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cart_items", "secondary_recommender_id")
    op.drop_column("cart_items", "primary_recommender_id")
    op.drop_column("cart_items", "converter_id")
