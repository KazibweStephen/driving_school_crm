"""normalize userrole and userstatus enums to lowercase

Revision ID: 280fdeff609d
Revises: f5e6d7c8b9a0
Create Date: 2026-07-10 18:55:24.576271

"""

from typing import Sequence, Union

from alembic import op


revision: str = "280fdeff609d"
down_revision: Union[str, None] = "f5e6d7c8b9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Normalize userrole enum to all lowercase
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute(
        "CREATE TYPE userrole AS ENUM('super_user', 'company_super_user', "
        "'branch_supervisor', 'office_admin', 'instructor', 'manager', 'reception')"
    )
    op.execute("""
        ALTER TABLE users ALTER COLUMN role TYPE userrole USING
            CASE role::text
                WHEN 'SUPER_USER' THEN 'super_user'::userrole
                WHEN 'BRANCH_SUPERVISOR' THEN 'branch_supervisor'::userrole
                WHEN 'OFFICE_ADMIN' THEN 'office_admin'::userrole
                WHEN 'INSTRUCTOR' THEN 'instructor'::userrole
                WHEN 'MANAGER' THEN 'manager'::userrole
                WHEN 'RECEPTION' THEN 'reception'::userrole
                WHEN 'COMPANY_SUPER_USER' THEN 'company_super_user'::userrole
                WHEN 'company_super_user' THEN 'company_super_user'::userrole
            END
    """)
    op.execute("DROP TYPE userrole_old")

    # Normalize userstatus enum to all lowercase
    op.execute("ALTER TYPE userstatus RENAME TO userstatus_old")
    op.execute(
        "CREATE TYPE userstatus AS ENUM('active', 'pending_approval', 'blocked', 'deactivated')"
    )
    op.execute("""
        ALTER TABLE users ALTER COLUMN status TYPE userstatus USING
            CASE status::text
                WHEN 'ACTIVE' THEN 'active'::userstatus
                WHEN 'BLOCKED' THEN 'blocked'::userstatus
                WHEN 'DEACTIVATED' THEN 'deactivated'::userstatus
                WHEN 'PENDING_APPROVAL' THEN 'pending_approval'::userstatus
                WHEN 'pending_approval' THEN 'pending_approval'::userstatus
            END
    """)
    op.execute("DROP TYPE userstatus_old")


def downgrade() -> None:
    # Revert userrole enum to uppercase
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute(
        "CREATE TYPE userrole AS ENUM('SUPER_USER', 'BRANCH_SUPERVISOR', "
        "'OFFICE_ADMIN', 'INSTRUCTOR', 'MANAGER', 'RECEPTION', 'COMPANY_SUPER_USER')"
    )
    op.execute("""
        ALTER TABLE users ALTER COLUMN role TYPE userrole USING
            CASE role::text
                WHEN 'super_user' THEN 'SUPER_USER'::userrole
                WHEN 'company_super_user' THEN 'COMPANY_SUPER_USER'::userrole
                WHEN 'branch_supervisor' THEN 'BRANCH_SUPERVISOR'::userrole
                WHEN 'office_admin' THEN 'OFFICE_ADMIN'::userrole
                WHEN 'instructor' THEN 'INSTRUCTOR'::userrole
                WHEN 'manager' THEN 'MANAGER'::userrole
                WHEN 'reception' THEN 'RECEPTION'::userrole
            END
    """)
    op.execute("DROP TYPE userrole_old")

    # Revert userstatus enum to uppercase
    op.execute("ALTER TYPE userstatus RENAME TO userstatus_old")
    op.execute(
        "CREATE TYPE userstatus AS ENUM('ACTIVE', 'BLOCKED', 'DEACTIVATED', 'PENDING_APPROVAL')"
    )
    op.execute("""
        ALTER TABLE users ALTER COLUMN status TYPE userstatus USING
            CASE status::text
                WHEN 'active' THEN 'ACTIVE'::userstatus
                WHEN 'blocked' THEN 'BLOCKED'::userstatus
                WHEN 'deactivated' THEN 'DEACTIVATED'::userstatus
                WHEN 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL'::userstatus
                WHEN 'pending_approval' THEN 'PENDING_APPROVAL'::userstatus
            END
    """)
    op.execute("DROP TYPE userstatus_old")
