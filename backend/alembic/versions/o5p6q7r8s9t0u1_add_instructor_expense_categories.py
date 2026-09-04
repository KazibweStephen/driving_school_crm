"""Add instructor expense categories (maintenance, spares, washing, parking, lunch, airtime).

Revision ID: o5p6q7r8s9t0u1
Revises: i9j0k1l2m3n4o5
Create Date: 2026-09-04 07:30:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "o5p6q7r8s9t0u1"
down_revision = "i9j0k1l2m3n4o5"
branch_labels = None
depends_on = None


CATEGORIES = [
    {"name": "Maintenance", "code": "maintenance", "sort_order": 21},
    {"name": "Spares", "code": "spares", "sort_order": 22},
    {"name": "Washing", "code": "washing", "sort_order": 23},
    {"name": "Parking", "code": "parking", "sort_order": 24},
    {"name": "Lunch", "code": "lunch", "sort_order": 25},
    {"name": "Airtime", "code": "airtime", "sort_order": 26},
]


def upgrade() -> None:
    conn = op.get_bind()
    for cat in CATEGORIES:
        conn.execute(
            sa.text(
                """
                INSERT INTO expense_categories
                    (id, company_id, name, code, requires_client, is_operating, account, sort_order, is_active)
                SELECT gen_random_uuid(), c.id, :name, :code, false, true, 'petty_cash', :sort_order, true
                FROM companies c
                ON CONFLICT (company_id, code) DO NOTHING
                """
            ),
            cat,
        )


def downgrade() -> None:
    conn = op.get_bind()
    for cat in CATEGORIES:
        conn.execute(
            sa.text(
                "DELETE FROM expense_categories WHERE code = :code"
            ),
            {"code": cat["code"]},
        )