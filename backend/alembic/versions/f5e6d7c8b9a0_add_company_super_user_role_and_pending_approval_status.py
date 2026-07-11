"""add company_super_user role and pending_approval status

Revision ID: f5e6d7c8b9a0
Revises: 0cedeb757155
Create Date: 2026-07-10 18:45:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f5e6d7c8b9a0'
down_revision: Union[str, None] = '89c43e2abb60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE 'company_super_user'")
    op.execute("ALTER TYPE userstatus ADD VALUE 'pending_approval'")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM('super_user', 'branch_supervisor', 'office_admin', 'instructor', 'manager', 'reception')")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_old")

    op.execute("ALTER TYPE userstatus RENAME TO userstatus_old")
    op.execute("CREATE TYPE userstatus AS ENUM('active', 'blocked', 'deactivated')")
    op.execute("ALTER TABLE users ALTER COLUMN status TYPE userstatus USING status::text::userstatus")
    op.execute("DROP TYPE userstatus_old")
