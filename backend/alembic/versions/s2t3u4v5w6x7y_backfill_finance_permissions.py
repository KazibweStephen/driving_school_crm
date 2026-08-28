"""backfill finance.view from reports.view for existing companies

The new ``finance`` permission group backs the branch cash-position and P&L
endpoints. Privileged roles were seeded with ``reports.view`` but existing
companies' role_permissions rows predate the ``finance`` group, so we extend
any role that already holds ``reports.view`` with ``finance.view`` to keep the
new read endpoints reachable.

Revision ID: s2t3u4v5w6x7y
Revises: r1s2t3u4v5w6x
Create Date: 2026-08-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "s2t3u4v5w6x7y"
down_revision: Union[str, None] = "r1s2t3u4v5w6x"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT DISTINCT company_id, role FROM role_permissions "
            "WHERE permission = 'reports.view'"
        )
    ).fetchall()
    for company_id, role in rows:
        bind.execute(
            sa.text(
                "INSERT INTO role_permissions (company_id, role, permission) "
                "VALUES (:company_id, CAST(:role AS userrole), 'finance.view') "
                "ON CONFLICT (company_id, role, permission) DO NOTHING"
            ),
            {"company_id": company_id, "role": role},
        )


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE permission = 'finance.view'")
