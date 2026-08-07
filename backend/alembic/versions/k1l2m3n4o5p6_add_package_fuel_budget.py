"""add package fuel budget (maximum expected fuel cost)

Creates ``package_fuel_rates`` (per-package maximum expected fuel cost per
training session, lifecycle like commission rates: one active at a time), plus
the denormalized snapshot column ``cart_items.fuel_rate_per_session`` and the
per-lesson consumption snapshot ``client_lessons.fuel_cost``.

Revision ID: k1l2m3n4o5p6
Revises: i3j4k5l6m7n8
Create Date: 2026-08-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, None] = "i3j4k5l6m7n8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "package_fuel_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "package_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("packages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("fuel_rate_per_session", sa.Numeric(10, 2), nullable=False),
        sa.Column("active_from", sa.Date(), nullable=False),
        sa.Column("active_until", sa.Date(), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    op.add_column(
        "cart_items",
        sa.Column("fuel_rate_per_session", sa.Numeric(10, 2), nullable=True),
    )

    op.add_column(
        "client_lessons",
        sa.Column("fuel_cost", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_lessons", "fuel_cost")
    op.drop_column("cart_items", "fuel_rate_per_session")
    op.drop_table("package_fuel_rates")
