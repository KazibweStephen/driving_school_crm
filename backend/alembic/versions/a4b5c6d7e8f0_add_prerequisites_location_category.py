"""add lesson_prerequisites table, preferred_location, training_category, prerequisite_competencies, enforce_prerequisites

Revision ID: a4b5c6d7e8f0
Revises: f3a4b5c6d7e8
Create Date: 2026-06-25 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'a4b5c6d7e8f0'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # LessonLibrary new columns
    op.add_column('lesson_library', sa.Column('preferred_location', sa.String(300), nullable=True))
    op.add_column('lesson_library', sa.Column('training_category', sa.String(50), nullable=False, server_default='driving'))
    op.add_column('lesson_library', sa.Column('prerequisite_competencies', sa.JSON(), nullable=True, server_default='[]'))

    # LessonPrerequisite junction table
    op.create_table('lesson_prerequisites',
        sa.Column('id', UUID(), nullable=False),
        sa.Column('lesson_id', UUID(), nullable=False),
        sa.Column('prerequisite_lesson_id', UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['lesson_id'], ['lesson_library.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['prerequisite_lesson_id'], ['lesson_library.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lesson_prerequisites_lesson_id', 'lesson_prerequisites', ['lesson_id'])
    op.create_index('ix_lesson_prerequisites_prerequisite_lesson_id', 'lesson_prerequisites', ['prerequisite_lesson_id'])

    # LessonTemplateItem new columns
    op.add_column('lesson_template_items', sa.Column('preferred_location', sa.String(300), nullable=True))
    op.add_column('lesson_template_items', sa.Column('enforce_prerequisites', sa.Boolean(), nullable=False, server_default='true'))

    # ClientLesson new columns
    op.add_column('client_lessons', sa.Column('preferred_location', sa.String(300), nullable=True))
    op.add_column('client_lessons', sa.Column('enforce_prerequisites', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('client_lessons', 'enforce_prerequisites')
    op.drop_column('client_lessons', 'preferred_location')
    op.drop_column('lesson_template_items', 'enforce_prerequisites')
    op.drop_column('lesson_template_items', 'preferred_location')
    op.drop_index('ix_lesson_prerequisites_prerequisite_lesson_id')
    op.drop_index('ix_lesson_prerequisites_lesson_id')
    op.drop_table('lesson_prerequisites')
    op.drop_column('lesson_library', 'prerequisite_competencies')
    op.drop_column('lesson_library', 'training_category')
    op.drop_column('lesson_library', 'preferred_location')
