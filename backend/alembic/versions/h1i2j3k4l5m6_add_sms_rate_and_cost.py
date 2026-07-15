"""add rate_per_sms to sms settings, sms_units/cost/provider_response to sms_logs

Revision ID: h1i2j3k4l5m6
Revises: g7h8i9j0k1l2
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as Uuid

revision = 'h1i2j3k4l5m6'
down_revision = 'g7h8i9j0k1l2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CompanySmsSettings: add rate_per_sms
    op.add_column('company_sms_settings', sa.Column('rate_per_sms', sa.Float(), nullable=False, server_default='0'))

    # SmsLog: add sms_units, cost, provider_response
    op.add_column('sms_logs', sa.Column('sms_units', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('sms_logs', sa.Column('cost', sa.Float(), nullable=False, server_default='0'))
    op.add_column('sms_logs', sa.Column('provider_response', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sms_logs', 'provider_response')
    op.drop_column('sms_logs', 'cost')
    op.drop_column('sms_logs', 'sms_units')
    op.drop_column('company_sms_settings', 'rate_per_sms')
