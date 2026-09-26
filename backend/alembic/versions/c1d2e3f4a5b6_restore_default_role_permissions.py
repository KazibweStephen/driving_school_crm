"""Re-grant stripped default permissions (instructor lost dashboard.view)

Some companies' stored `role_permissions` for the `instructor` role no longer
contained `dashboard.view`, even though it is part of the role's default matrix
(`app/core/permissions.py`). Every authenticated user is sent to a landing page
after login, and both the web `/dashboard` route and the mobile home dashboard
are gated on `dashboard.view`, so instructors in those companies were bounced off
the dashboard and the app never finished loading.

This migration re-adds any permission that appears in the role's *default* set
but is missing from the company's stored rows. It only ever ADDS grants, so a
deliberate customisation that removed a default is also restored — which is the
intent: the defaults are the supported baseline.
"""

from alembic import op
from sqlalchemy import text

# role -> permissions that must be present (subset of the code default matrix).
# Keep this list explicit and minimal: it is the "must never be missing" baseline.
REQUIRED = {
    "instructor": [
        "dashboard.view",
        "consultations.view",
        "training.view",
        "lesson_plans.view",
        "lesson_execution.view",
    ],
}

revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for role, permissions in REQUIRED.items():
        for permission in permissions:
            conn.execute(
                text("""
                INSERT INTO role_permissions (company_id, role, permission)
                SELECT c.id, :role, :permission
                FROM companies c
                WHERE NOT EXISTS (
                    SELECT 1 FROM role_permissions r
                    WHERE r.company_id = c.id
                      AND r.role = :role
                      AND r.permission = :permission
                )
                """),
                {"role": role, "permission": permission},
            )


def downgrade():
    conn = op.get_bind()
    for role, permissions in REQUIRED.items():
        for permission in permissions:
            conn.execute(
                text(""")
                DELETE FROM role_permissions
                WHERE role = :role AND permission = :permission
                """),
                {"role": role, "permission": permission},
            )
