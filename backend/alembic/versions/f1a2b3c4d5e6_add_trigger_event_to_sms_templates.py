"""add trigger_event to sms_templates

Revision ID: f1a2b3c4d5e6
Revises: e4f5a6b7c8d9
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as Uuid

revision = 'f1a2b3c4d5e6'
down_revision = 'e4f5a6b7c8d9'
branch_labels = None
depends_on = None

sms_trigger_enum = sa.Enum(
    'user_created', 'pin_reset', 'consultation_created',
    'payment_received', 'installment_due', 'installment_overdue',
    'cart_item_converted', 'expense_approved', 'lesson_scheduled',
    'lesson_cancelled', 'lesson_reminder', 'training_completed',
    'permit_expiring', 'manual',
    name='smstrigger',
)


def upgrade() -> None:
    sms_trigger_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'sms_templates',
        sa.Column('trigger_event', sms_trigger_enum, nullable=False, server_default='manual'),
    )
    op.alter_column('sms_templates', 'trigger_event', server_default=None)


def downgrade() -> None:
    op.drop_column('sms_templates', 'trigger_event')
    sms_trigger_enum.drop(op.get_bind(), checkfirst=True)
