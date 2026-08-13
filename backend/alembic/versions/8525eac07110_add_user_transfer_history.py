"""add user transfer history

Revision ID: 8525eac07110
Revises: w2x3y4z5a6b7
Create Date: 2026-08-13 18:23:38.243704

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8525eac07110'
down_revision: Union[str, None] = 'w2x3y4z5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('user_transfer_history',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_phone', sa.String(length=20), nullable=False),
        sa.Column('from_company_id', sa.UUID(), nullable=False),
        sa.Column('to_company_id', sa.UUID(), nullable=False),
        sa.Column('from_branch_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('to_branch_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('role_before', sa.String(length=20), nullable=True),
        sa.Column('role_after', sa.String(length=20), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('transferred_by', sa.String(length=20), nullable=False),
        sa.Column('is_reversed', sa.Boolean(), nullable=False),
        sa.Column('reversed_by', sa.String(length=20), nullable=True),
        sa.Column('reversed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['from_company_id'], ['companies.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['reversed_by'], ['users.phone'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['to_company_id'], ['companies.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['transferred_by'], ['users.phone'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_phone'], ['users.phone'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_transfer_history_user_phone'), 'user_transfer_history', ['user_phone'], unique=False)
    op.create_index(op.f('ix_user_transfer_history_from_company_id'), 'user_transfer_history', ['from_company_id'], unique=False)
    op.create_index(op.f('ix_user_transfer_history_to_company_id'), 'user_transfer_history', ['to_company_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_transfer_history_to_company_id'), table_name='user_transfer_history')
    op.drop_index(op.f('ix_user_transfer_history_from_company_id'), table_name='user_transfer_history')
    op.drop_index(op.f('ix_user_transfer_history_user_phone'), table_name='user_transfer_history')
    op.drop_table('user_transfer_history')
