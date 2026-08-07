"""add monthly_sales_target to companies

Revision ID: m2n3o4p5q6r7
Revises: k2l3m4n5o6p7
Create Date: 2026-08-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m2n3o4p5q6r7"
down_revision: Union[str, None] = "k2l3m4n5o6p7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("monthly_sales_target", sa.Numeric(14, 2), nullable=True),
    )
    op.execute("UPDATE companies SET monthly_sales_target = 10000000.00 WHERE monthly_sales_target IS NULL")
    op.alter_column("companies", "monthly_sales_target", nullable=False)


def downgrade() -> None:
    op.drop_column("companies", "monthly_sales_target")
