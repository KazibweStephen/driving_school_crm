"""add sms_logs table

Revision ID: g7h8i9j0k1l2
Revises: f1a2b3c4d5e6
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as Uuid

revision = 'g7h8i9j0k1l2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sms_logs',
        sa.Column('id', Uuid, primary_key=True),
        sa.Column('company_id', Uuid, sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('phone', sa.String(20), nullable=False, index=True),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('message_length', sa.Integer, nullable=False),
        sa.Column('provider', sa.String(20), nullable=False, server_default='logging'),
        sa.Column('trigger_event', sa.String(50), nullable=True),
        sa.Column('template_id', Uuid, sa.ForeignKey('sms_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='sent'),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_sms_logs_company_sent_at', 'sms_logs', ['company_id', 'sent_at'])


def downgrade() -> None:
    op.drop_index('ix_sms_logs_company_sent_at')
    op.drop_table('sms_logs')
