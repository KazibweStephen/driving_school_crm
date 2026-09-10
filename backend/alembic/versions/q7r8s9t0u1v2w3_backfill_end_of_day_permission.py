"""backfill finance.end_of_day permission for existing companies

The ``finance`` group gained ``finance.end_of_day``. Roles that already hold
``finance.view`` are extended with it so existing deployments keep working
while allowing admins to revoke it granularly.

Revision ID: q7r8s9t0u1v2w3
Revises: p6q7r8s9t0u1v2
Create Date: 2026-09-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "q7r8s9t0u1v2w3"
down_revision: Union[str, None] = "p6q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CODE = "finance.end_of_day"


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT DISTINCT company_id, role FROM role_permissions "
            "WHERE permission = 'finance.view'"
        )
    ).fetchall()
    for company_id, role in rows:
        bind.execute(
            sa.text(
                "INSERT INTO role_permissions (company_id, role, permission) "
                "VALUES (:company_id, CAST(:role AS userrole), :code) "
                "ON CONFLICT (company_id, role, permission) DO NOTHING"
            ),
            {"company_id": company_id, "role": role, "code": _CODE},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM role_permissions WHERE permission = :code"),
        {"code": _CODE},
    )