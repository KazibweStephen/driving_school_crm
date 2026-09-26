"""Add the new `period_reports` permission group to existing companies.

New permission group introduced for the week/month/quarter/year period reports
(week & month sales, collections, conversions, expenses, goal status, best
selling products, best performing staff, clients at risk). It is granted to the
same roles that already hold `reports.view` in the default matrix
(office_admin, branch_supervisor, manager, supervisor) so no existing company
loses access to anything and the reports can be narrowed later per company.
"""

from alembic import op
from sqlalchemy import text

revision = "d3e4f5a6b7c8"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None

CODES = ("period_reports.manage", "period_reports.view", "period_reports.print")

# Roles seeded with `reports.view` in `_DEFAULT_MATRIX` (app/core/permissions.py).
ROLES = ("office_admin", "branch_supervisor", "manager", "supervisor")


def upgrade():
    conn = op.get_bind()
    for role in ROLES:
        for code in CODES:
            conn.execute(
                text(
                    """
                    INSERT INTO role_permissions (company_id, role, permission)
                    SELECT c.id, CAST(:role AS userrole), :permission
                    FROM companies c
                    WHERE EXISTS (
                        SELECT 1 FROM role_permissions r
                        WHERE r.company_id = c.id
                          AND r.role = CAST(:role AS userrole)
                          AND r.permission = 'reports.view'
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM role_permissions r2
                        WHERE r2.company_id = c.id
                          AND r2.role = CAST(:role AS userrole)
                          AND r2.permission = :permission
                    )
                    """
                ),
                {"role": role, "permission": code},
            )


def downgrade():
    conn = op.get_bind()
    for role in ROLES:
        for code in CODES:
            conn.execute(
                text(
                    """
                    DELETE FROM role_permissions
                    WHERE role = CAST(:role AS userrole) AND permission = :permission
                    """
                ),
                {"role": role, "permission": code},
            )
