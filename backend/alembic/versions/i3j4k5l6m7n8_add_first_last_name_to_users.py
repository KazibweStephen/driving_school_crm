"""add first_name and last_name to users

Adds ``first_name`` / ``last_name`` columns to the ``users`` table so the
header and profile views can display a readable name next to the phone
(username) instead of only the raw mobile number. Existing rows are backfilled
by splitting the legacy ``name`` column on the first space.

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-08-01 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "i3j4k5l6m7n8"
down_revision: Union[str, None] = "h2i3j4k5l6m7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(length=50), server_default="", nullable=False))
    op.add_column("users", sa.Column("last_name", sa.String(length=50), server_default="", nullable=False))
    op.execute(
        """
        UPDATE users
        SET first_name = split_part(name, ' ', 1),
            last_name = CASE
                WHEN position(' ' IN name) > 0 THEN substr(name, position(' ' IN name) + 1)
                ELSE ''
            END
        """
    )


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
