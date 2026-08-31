"""backfill operating-account permissions for existing companies

The company Operating Account introduced two new finance codes:
  - finance.operating  (view balance/ledger — needed to fund branches)
  - finance.capital    (record equity/loans/profit, repay loans)
Roles that can already fund branches (hold finance.fund) get finance.operating;
company finance roles (office_admin, manager) additionally get finance.capital.

Revision ID: z0a1b2c3d4e5f6
Revises: y9z0a1b2c3d4e5
Create Date: 2026-08-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "z0a1b2c3d4e5f6"
down_revision: Union[str, None] = "y9z0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _grant(bind, company_id, role, code):
    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (company_id, role, permission) "
            "VALUES (:company_id, CAST(:role AS userrole), :code) "
            "ON CONFLICT (company_id, role, permission) DO NOTHING"
        ),
        {"company_id": company_id, "role": role, "code": code},
    )


def upgrade() -> None:
    bind = op.get_bind()

    fund_rows = bind.execute(
        sa.text(
            "SELECT DISTINCT company_id, role FROM role_permissions "
            "WHERE permission = 'finance.fund'"
        )
    ).fetchall()
    for company_id, role in fund_rows:
        _grant(bind, company_id, role, "finance.operating")

    capital_rows = bind.execute(
        sa.text(
            "SELECT DISTINCT company_id FROM role_permissions "
            "WHERE permission = 'finance.fund'"
        )
    ).fetchall()
    for (company_id,) in capital_rows:
        for role in ("office_admin", "manager"):
            _grant(bind, company_id, role, "finance.capital")


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM role_permissions WHERE permission = 'finance.operating'"))
    bind.execute(sa.text("DELETE FROM role_permissions WHERE permission = 'finance.capital'"))
