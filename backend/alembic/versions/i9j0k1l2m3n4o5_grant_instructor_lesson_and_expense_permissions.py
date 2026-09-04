"""Grant lesson_plans.edit, expenses.*, commissions.view to instructor role.

Revision ID: i9j0k1l2m3n4o5
Revises: f2a3b4c5d6e7
Create Date: 2026-09-04 07:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i9j0k1l2m3n4o5"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


NEW_CODES = [
    "lesson_plans.edit",
    "expenses.view",
    "expenses.create",
    "commissions.view",
]
ROLES = ["instructor"]


def upgrade() -> None:
    conn = op.get_bind()
    for code in NEW_CODES:
        for role in ROLES:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO role_permissions (company_id, role, permission)
                    SELECT c.id, :role, :permission
                    FROM companies c
                    ON CONFLICT (company_id, role, permission) DO NOTHING
                    """
                ),
                {"role": role, "permission": code},
            )


def downgrade() -> None:
    conn = op.get_bind()
    for code in NEW_CODES:
        for role in ROLES:
            conn.execute(
                sa.text(
                    """
                    DELETE FROM role_permissions
                    WHERE role = :role AND permission = :permission
                    """
                ),
                {"role": role, "permission": code},
            )