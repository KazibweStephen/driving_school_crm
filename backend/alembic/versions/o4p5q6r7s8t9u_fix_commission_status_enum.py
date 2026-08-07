"""Align commissionstatus enum with CommissionStatus model values.

Revision ID: o4p5q6r7s8t9u
Revises: n3o4p5q6r7s8t
Create Date: 2026-08-06 19:30:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "o4p5q6r7s8t9u"
down_revision = "n3o4p5q6r7s8t"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TYPE commissionstatus RENAME VALUE 'paid' TO 'fully_matured'"))
    conn.execute(sa.text("ALTER TYPE commissionstatus ADD VALUE 'partially_matured'"))


def downgrade() -> None:
    conn = op.get_bind()
    # Cannot safely remove enum values; reverse the rename if no partially_matured rows exist.
    conn.execute(sa.text("ALTER TYPE commissionstatus RENAME VALUE 'fully_matured' TO 'paid'"))
