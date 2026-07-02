"""add lesson_library_id to lesson_template_items

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-06-24 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lesson_template_items', sa.Column('lesson_library_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_lesson_template_items_lesson_library_id'), 'lesson_template_items', ['lesson_library_id'])
    op.create_foreign_key('fk_lesson_template_items_lesson_library', 'lesson_template_items',
                          'lesson_library', ['lesson_library_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_lesson_template_items_lesson_library', 'lesson_template_items', type_='foreignkey')
    op.drop_index(op.f('ix_lesson_template_items_lesson_library_id'), table_name='lesson_template_items')
    op.drop_column('lesson_template_items', 'lesson_library_id')
