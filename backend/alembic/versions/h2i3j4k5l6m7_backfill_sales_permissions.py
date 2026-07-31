"""backfill sales permissions from expenses for existing companies

Carves a new ``sales`` permission group out of the ``expenses`` group. Sales
endpoints were previously gated by ``expenses.view`` / ``expenses.manage``, so
existing (company, role) grants must be extended to keep their capability:

* has ``expenses.view``        -> grant ``sales.view``
* has ``expenses.manage``      -> grant ``sales.view`` + ``sales.create/edit/delete``

Revision ID: h2i3j4k5l6m7
Revises: g1a2b3c4d5e6f
Create Date: 2026-07-31 16:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "h2i3j4k5l6m7"
down_revision: Union[str, None] = "g1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT DISTINCT company_id, role, permission
            FROM role_permissions
            WHERE permission IN ('expenses.view', 'expenses.manage')
            """
        )
    ).fetchall()

    grants: set[tuple] = set()
    for company_id, role, permission in rows:
        if permission == "expenses.manage":
            grants.add((company_id, role, "sales.view"))
            grants.add((company_id, role, "sales.create"))
            grants.add((company_id, role, "sales.edit"))
            grants.add((company_id, role, "sales.delete"))
        else:
            grants.add((company_id, role, "sales.view"))

    for company_id, role, permission in sorted(grants, key=lambda g: (str(g[0]), g[1], g[2])):
        bind.execute(
            sa.text(
                "INSERT INTO role_permissions (company_id, role, permission) "
                "VALUES (:company_id, CAST(:role AS userrole), :permission) "
                "ON CONFLICT (company_id, role, permission) DO NOTHING"
            ),
            {"company_id": company_id, "role": role, "permission": permission},
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE permission IN "
        "('sales.view', 'sales.create', 'sales.edit', 'sales.delete')"
    )
