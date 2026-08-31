"""backfill granular finance sub-permissions for existing companies

The ``finance`` group gained granular codes (cash_position, pnl, send, fund)
to allow role-based flexibility over cash-position, P&L, remittances and
head-office funding. Roles that already hold ``finance.view`` are extended
with these sub-codes so existing deployments keep working while allowing
admins to revoke them granularly.

Revision ID: w3x4y5z6a7b8
Revises: u2v3w4x5y6z7a
Create Date: 2026-08-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "w3x4y5z6a7b8"
down_revision: Union[str, None] = "u2v3w4x5y6z7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SUB_CODES = ["finance.cash_position", "finance.pnl", "finance.send", "finance.fund"]


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT DISTINCT company_id, role FROM role_permissions "
            "WHERE permission = 'finance.view'"
        )
    ).fetchall()
    for code in _SUB_CODES:
        for company_id, role in rows:
            bind.execute(
                sa.text(
                    "INSERT INTO role_permissions (company_id, role, permission) "
                    "VALUES (:company_id, CAST(:role AS userrole), :code) "
                    "ON CONFLICT (company_id, role, permission) DO NOTHING"
                ),
                {"company_id": company_id, "role": role, "code": code},
            )


def downgrade() -> None:
    bind = op.get_bind()
    for code in _SUB_CODES:
        bind.execute(
            sa.text("DELETE FROM role_permissions WHERE permission = :code"),
            {"code": code},
        )
