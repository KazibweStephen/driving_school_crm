"""add converted_paid converted_paying to cart item status

Revision ID: a47cfe4be574
Revises: af1e9a7e0fad
Create Date: 2026-06-14 12:58:31.708292

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a47cfe4be574'
down_revision: Union[str, None] = 'af1e9a7e0fad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE cartitemstatus ADD VALUE 'converted_paid'")
    op.execute("ALTER TYPE cartitemstatus ADD VALUE 'converted_paying'")


def downgrade() -> None:
    op.execute("ALTER TYPE cartitemstatus RENAME TO cartitemstatus_old")
    op.execute("CREATE TYPE cartitemstatus AS ENUM('interested', 'consulting', 'converted', 'lost')")
    op.execute("ALTER TABLE cart_items ALTER COLUMN status TYPE cartitemstatus USING status::text::cartitemstatus")
    op.execute("DROP TYPE cartitemstatus_old")
