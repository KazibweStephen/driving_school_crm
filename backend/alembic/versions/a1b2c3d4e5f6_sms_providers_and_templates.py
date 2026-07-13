"""sms providers and templates

Revision ID: a1b2c3d4e5f6
Revises: d8e9f0a1b2c3
Create Date: 2026-07-13 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sms_template_category enum
    sms_template_category = postgresql.ENUM(
        'pin_creation_reset', 'training_cancellation', 'lesson_reminder',
        'lesson_scheduling', 'branch_visit', 'payment_receipt',
        'payment_installment', 'permit_expiring', 'general', 'custom',
        name='sms_templatecategory',
        create_type=False,
    )
    sms_template_category.create(op.get_bind(), checkfirst=True)

    # Create company_sms_settings table
    op.create_table(
        'company_sms_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('companies.id', ondelete='CASCADE'),
                   unique=True, nullable=False, index=True),
        sa.Column('is_active', sa.Boolean(), server_default='f', nullable=False),
        sa.Column('provider', sa.String(20), server_default='logging', nullable=False),
        sa.Column('egosms_api_url', sa.String(500),
                   server_default='https://www.egosms.co/api/v1/plain/', nullable=False),
        sa.Column('egosms_username', sa.String(100), server_default='', nullable=False),
        sa.Column('egosms_password', sa.String(100), server_default='', nullable=False),
        sa.Column('egosms_sender', sa.String(20), server_default='', nullable=False),
        sa.Column('twilio_account_sid', sa.String(100), server_default='', nullable=False),
        sa.Column('twilio_auth_token', sa.String(100), server_default='', nullable=False),
        sa.Column('twilio_phone_number', sa.String(20), server_default='', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Create sms_templates table
    op.create_table(
        'sms_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('companies.id', ondelete='CASCADE'),
                   nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('category', sms_template_category, nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='t', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('sms_templates')
    op.drop_table('company_sms_settings')
    sa.Enum(name='sms_templatecategory').drop(op.get_bind(), checkfirst=True)
