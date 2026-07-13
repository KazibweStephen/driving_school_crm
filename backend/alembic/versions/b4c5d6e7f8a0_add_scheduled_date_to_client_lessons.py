"""add scheduled_date, scheduled_start_time, scheduled_end_time, duration_minutes, plan_locked_time to client_lessons

This adds columns that exist in the ORM model but were never created
by any migration.

Revision ID: b4c5d6e7f8a0
Revises: 68c03818a4ee
Create Date: 2026-07-13 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b4c5d6e7f8a0"
down_revision: Union[str, None] = "68c03818a4ee"
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_lessons", sa.Column("scheduled_date", sa.Date(), nullable=True))
    op.add_column("client_lessons", sa.Column("scheduled_start_time", sa.Time(), nullable=True))
    op.add_column("client_lessons", sa.Column("scheduled_end_time", sa.Time(), nullable=True))
    op.add_column("client_lessons", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    op.add_column("client_lessons", sa.Column("plan_locked_time", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("client_lessons", "plan_locked_time")
    op.drop_column("client_lessons", "duration_minutes")
    op.drop_column("client_lessons", "scheduled_end_time")
    op.drop_column("client_lessons", "scheduled_start_time")
    op.drop_column("client_lessons", "scheduled_date")
