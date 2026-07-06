"""add session structure, extension, theory type fields

Revision ID: 6cf9e0532e9e
Revises: a4b5c6d7e8f0
Create Date: 2026-07-02 15:28:35.192245

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6cf9e0532e9e'
down_revision: Union[str, None] = 'a4b5c6d7e8f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Products & Packages — extension flags
    op.add_column('products', sa.Column('is_extension', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('packages', sa.Column('is_extension', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('packages', sa.Column('extension_days', sa.Integer(), nullable=True))

    # Lesson plan templates — template_type
    op.add_column('lesson_plan_templates', sa.Column('template_type', sa.String(length=20), server_default='practical', nullable=False))

    # Template items — is_theory
    op.add_column('lesson_template_items', sa.Column('is_theory', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # Library — is_theory
    op.add_column('lesson_library', sa.Column('is_theory', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # Client lesson plans — extension tracking
    op.add_column('client_lesson_plans', sa.Column('is_extension', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('client_lesson_plans', sa.Column('extension_of_plan_id', sa.UUID(), nullable=True))
    op.add_column('client_lesson_plans', sa.Column('extension_days_added', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_client_lesson_plans_extension_of_plan_id'), 'client_lesson_plans', ['extension_of_plan_id'], unique=False)
    op.create_foreign_key('fk_client_lesson_plans_extension_of_plan', 'client_lesson_plans', 'client_lesson_plans',
                          ['extension_of_plan_id'], ['id'], ondelete='SET NULL')

    # Client lessons — session structure + is_theory
    op.add_column('client_lessons', sa.Column('vehicle_inspection_minutes', sa.Integer(), nullable=True))
    op.add_column('client_lessons', sa.Column('cockpit_drill_minutes', sa.Integer(), nullable=True))
    op.add_column('client_lessons', sa.Column('video_illustration_minutes', sa.Integer(), nullable=True))
    op.add_column('client_lessons', sa.Column('practical_driving_minutes', sa.Integer(), nullable=True))
    op.add_column('client_lessons', sa.Column('assessment_minutes', sa.Integer(), nullable=True))
    op.add_column('client_lessons', sa.Column('is_theory', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('client_lessons', 'is_theory')
    op.drop_column('client_lessons', 'assessment_minutes')
    op.drop_column('client_lessons', 'practical_driving_minutes')
    op.drop_column('client_lessons', 'video_illustration_minutes')
    op.drop_column('client_lessons', 'cockpit_drill_minutes')
    op.drop_column('client_lessons', 'vehicle_inspection_minutes')

    op.drop_constraint('fk_client_lesson_plans_extension_of_plan', 'client_lesson_plans', type_='foreignkey')
    op.drop_index(op.f('ix_client_lesson_plans_extension_of_plan_id'), table_name='client_lesson_plans')
    op.drop_column('client_lesson_plans', 'extension_days_added')
    op.drop_column('client_lesson_plans', 'extension_of_plan_id')
    op.drop_column('client_lesson_plans', 'is_extension')

    op.drop_column('lesson_library', 'is_theory')
    op.drop_column('lesson_template_items', 'is_theory')
    op.drop_column('lesson_plan_templates', 'template_type')
    op.drop_column('packages', 'extension_days')
    op.drop_column('packages', 'is_extension')
    op.drop_column('products', 'is_extension')
