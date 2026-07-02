"""add estimated_minutes and estimated_distance_km to lesson_template_items

Revision ID: d1e2f3a4b5c6
Revises: 7e8f9a0b1c2d
Create Date: 2026-06-24 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "7e8f9a0b1c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lesson_template_items",
        sa.Column("estimated_minutes", sa.Integer, nullable=False, server_default=sa.text("30")),
    )
    op.add_column(
        "lesson_template_items",
        sa.Column("estimated_distance_km", sa.Float, nullable=False, server_default=sa.text("3.0")),
    )


def downgrade() -> None:
    op.drop_column("lesson_template_items", "estimated_distance_km")
    op.drop_column("lesson_template_items", "estimated_minutes")
