"""add_template_type_to_client_lesson_plans

Revision ID: 68c03818a4ee
Revises: 6cf9e0532e9e
Create Date: 2026-07-03 14:58:44.383254

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '68c03818a4ee'
down_revision: Union[str, None] = '6cf9e0532e9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('client_lesson_plans', sa.Column('template_type', sa.String(length=20), server_default='practical', nullable=False))
    # Backfill existing plans from their template's template_type
    op.execute("""
        UPDATE client_lesson_plans AS p
        SET template_type = COALESCE(t.template_type, 'practical')
        FROM lesson_plan_templates AS t
        WHERE p.template_id = t.id
    """)


def downgrade() -> None:
    op.drop_column('client_lesson_plans', 'template_type')
