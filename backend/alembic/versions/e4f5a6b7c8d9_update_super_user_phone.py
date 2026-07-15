"""update super user phone

Revision ID: e4f5a6b7c8d9
Revises: d2e3f4a5b6c7
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'e4f5a6b7c8d9'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None

OLD_PHONE = '256700000000'
NEW_PHONE = '0782832711'

FK_TABLES = [
    ('users', 'created_by_phone'),
    ('products', 'created_by_phone'),
    ('packages', 'created_by_phone'),
    ('video_library', 'created_by_phone'),
    ('lesson_library', 'created_by_phone'),
    ('lesson_plan_templates', 'created_by_phone'),
    ('import_logs', 'created_by_phone'),
    ('instructor_qualifications', 'instructor_phone'),
    ('expenses', 'created_by_phone'),
    ('expenses', 'approved_by'),
    ('expenses', 'paid_by'),
    ('sales', 'created_by_phone'),
    ('borrowed_money', 'created_by_phone'),
    ('collections', 'collected_by'),
    ('payments', 'created_by_phone'),
    ('leads', 'submitted_by_id'),
    ('commission_contests', 'contested_by_id'),
    ('commission_contests', 'resolved_by_id'),
    ('commissions', 'secondary_recommender_id'),
    ('commissions', 'converter_id'),
    ('commissions', 'primary_recommender_id'),
    ('user_branch_assignments', 'user_id'),
]


def upgrade() -> None:
    conn = op.get_bind()
    old_exists = conn.execute(
        sa.text(f"SELECT 1 FROM users WHERE phone = '{OLD_PHONE}'")
    ).fetchone()
    if not old_exists:
        return

    for table, column in FK_TABLES:
        op.execute(
            sa.text(f"UPDATE {table} SET {column} = '{NEW_PHONE}' WHERE {column} = '{OLD_PHONE}'")
        )
    op.execute(
        sa.text(f"DELETE FROM users WHERE phone = '{OLD_PHONE}'")
    )


def downgrade() -> None:
    pass
