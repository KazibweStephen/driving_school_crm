"""Grant expenses.create and expenses.delete to office_admin and branch_supervisor roles.

Revision ID: n3o4p5q6r7s8t
Revises: m2n3o4p5q6r7
Create Date: 2026-08-06 18:45:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "n3o4p5q6r7s8t"
down_revision = "m2n3o4p5q6r7"
branch_labels = None
depends_on = None


NEW_CODES = ["expenses.create", "expenses.delete"]
ROLES = ["office_admin", "branch_supervisor"]


def upgrade() -> None:
    conn = op.get_bind()
    for code in NEW_CODES:
        conn.execute(
            sa.text(
                """
                INSERT INTO role_permissions (company_id, role, permission)
                SELECT c.id, :role, :permission
                FROM companies c
                ON CONFLICT (company_id, role, permission) DO NOTHING
                """
            ),
            {"role": "office_admin", "permission": code},
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO role_permissions (company_id, role, permission)
                SELECT c.id, :role, :permission
                FROM companies c
                ON CONFLICT (company_id, role, permission) DO NOTHING
                """
            ),
            {"role": "branch_supervisor", "permission": code},
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
