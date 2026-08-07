"""grant sms.send to office_admin and branch_supervisor

The Office Admin mobile app sends SMS to clients via ``POST /api/v1/sms/send``
which is gated by ``sms.send``. Office admins previously only had ``sms.view``,
so grant ``sms.send`` for these roles across all existing companies.

Revision ID: k2l3m4n5o6p7
Revises: h2i3j4k5l6m7, k1l2m3n4o5p6
Create Date: 2026-08-06 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "k2l3m4n5o6p7"
down_revision: Union[str, Sequence[str], None] = ("h2i3j4k5l6m7", "k1l2m3n4o5p6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT DISTINCT company_id, role
            FROM role_permissions
            WHERE role IN ('office_admin', 'branch_supervisor')
            """
        )
    ).fetchall()

    for company_id, role in rows:
        bind.execute(
            sa.text(
                "INSERT INTO role_permissions (company_id, role, permission) "
                "VALUES (:company_id, CAST(:role AS userrole), 'sms.send') "
                "ON CONFLICT (company_id, role, permission) DO NOTHING"
            ),
            {"company_id": company_id, "role": role},
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE permission = 'sms.send' "
        "AND role IN ('office_admin', 'branch_supervisor')"
    )
