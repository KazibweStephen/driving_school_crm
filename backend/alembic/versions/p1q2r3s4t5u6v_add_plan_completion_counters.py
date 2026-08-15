"""add_plan_completion_counters

Revision ID: p1q2r3s4t5u6v
Revises: d13cd90a16c4
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'p1q2r3s4t5u6v'
down_revision = 'd13cd90a16c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('client_lesson_plans', sa.Column('lessons_completed', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('client_lesson_plans', sa.Column('practical_lessons_completed', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('client_lesson_plans', sa.Column('theory_lessons_completed', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('client_lesson_plans', 'theory_lessons_completed')
    op.drop_column('client_lesson_plans', 'practical_lessons_completed')
    op.drop_column('client_lesson_plans', 'lessons_completed')
