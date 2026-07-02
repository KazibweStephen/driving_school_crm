"""add payments installments notification_preferences and active status

Revision ID: c8941a4992d6
Revises: f6e4c3a2d1b0
Create Date: 2026-06-14 08:12:23.453635

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c8941a4992d6'
down_revision: Union[str, None] = 'f6e4c3a2d1b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'active' to existing consultationstatus enum
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'active' AND enumtypid = 'consultationstatus'::regtype) THEN
                ALTER TYPE consultationstatus ADD VALUE 'active';
            END IF;
        END
        $$;
    """)

    # Recreate enum types — they existed from a prior attempt but their tables were dropped
    op.execute("DROP TYPE IF EXISTS notificationchannel CASCADE")
    op.execute("CREATE TYPE notificationchannel AS ENUM ('whatsapp', 'telegram', 'sms')")
    op.execute("DROP TYPE IF EXISTS installmentstatus CASCADE")
    op.execute("CREATE TYPE installmentstatus AS ENUM ('pending', 'paid', 'overdue', 'cancelled')")

    op.create_table('notification_preferences',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('consultation_id', sa.UUID(), nullable=False),
    sa.Column('channel', postgresql.ENUM('whatsapp', 'telegram', 'sms', name='notificationchannel', create_type=False), nullable=False),
    sa.Column('recipient', sa.String(length=200), nullable=False),
    sa.Column('opt_in', sa.Boolean(), nullable=False),
    sa.Column('reminders_enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['consultation_id'], ['consultations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('consultation_id')
    )
    op.create_table('payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('consultation_id', sa.UUID(), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=False),
    sa.Column('package_id', sa.String(length=36), nullable=True),
    sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['consultation_id'], ['consultations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_consultation_id'), 'payments', ['consultation_id'], unique=False)
    op.create_table('installments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('payment_id', sa.UUID(), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('status', postgresql.ENUM('pending', 'paid', 'overdue', 'cancelled', name='installmentstatus', create_type=False), nullable=False),
    sa.Column('paid_date', sa.Date(), nullable=True),
    sa.Column('paid_amount', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['payment_id'], ['payments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_installments_payment_id'), 'installments', ['payment_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_installments_payment_id'), table_name='installments')
    op.drop_table('installments')
    op.drop_index(op.f('ix_payments_consultation_id'), table_name='payments')
    op.drop_table('payments')
    op.drop_table('notification_preferences')
    # Note: cannot easily remove enum values in PostgreSQL
