"""add_expense_approval_borrowed_collections

Revision ID: 4a3ed1ce60df
Revises: 03340a0699ad
Create Date: 2026-07-07 11:41:42.495805

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a3ed1ce60df'
down_revision: Union[str, None] = '03340a0699ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types first as text, then alter columns to enum
    sa.Enum('pending', 'approved', 'rejected', 'paid', name='expensestatus').create(op.get_bind())
    sa.Enum('active', 'repaid', 'written_off', name='borrowstatus').create(op.get_bind())
    sa.Enum('pending', 'collected', 'partial', 'cancelled', name='collectionstatus').create(op.get_bind())

    op.create_table('borrowed_money',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('branch_id', sa.UUID(), nullable=False),
    sa.Column('direction', sa.String(length=20), nullable=False),
    sa.Column('amount', sa.Float(), nullable=False),
    sa.Column('interest_rate', sa.Float(), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('lender_name', sa.String(length=200), nullable=True),
    sa.Column('borrower_name', sa.String(length=200), nullable=True),
    sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_by_phone', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_phone'], ['users.phone'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_borrowed_money_branch_id'), 'borrowed_money', ['branch_id'], unique=False)
    op.execute("ALTER TABLE borrowed_money ALTER COLUMN status TYPE borrowstatus USING status::borrowstatus")

    op.create_table('collections',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('installment_id', sa.UUID(), nullable=False),
    sa.Column('consultation_id', sa.UUID(), nullable=False),
    sa.Column('amount_due', sa.Float(), nullable=False),
    sa.Column('amount_collected', sa.Float(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('dunning_count', sa.Integer(), nullable=False),
    sa.Column('last_dunning_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('collected_by', sa.String(length=20), nullable=True),
    sa.Column('collected_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['collected_by'], ['users.phone'], ),
    sa.ForeignKeyConstraint(['consultation_id'], ['consultations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['installment_id'], ['installments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_collections_consultation_id'), 'collections', ['consultation_id'], unique=False)
    op.create_index(op.f('ix_collections_installment_id'), 'collections', ['installment_id'], unique=False)
    op.execute("ALTER TABLE collections ALTER COLUMN status TYPE collectionstatus USING status::collectionstatus")

    op.add_column('expenses', sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'))
    op.add_column('expenses', sa.Column('approved_by', sa.String(length=20), nullable=True))
    op.add_column('expenses', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('expenses', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column('expenses', sa.Column('receipt_url', sa.Text(), nullable=True))
    op.create_foreign_key(None, 'expenses', 'users', ['approved_by'], ['phone'])
    op.alter_column('expenses', 'status', server_default=None)
    op.execute("ALTER TABLE expenses ALTER COLUMN status TYPE expensestatus USING status::expensestatus")


def downgrade() -> None:
    op.drop_constraint(None, 'expenses', type_='foreignkey')
    op.alter_column('expenses', 'status', server_default='pending', type_=sa.String(length=20))
    op.execute("ALTER TABLE expenses ALTER COLUMN status TYPE varchar(20) USING status::varchar")
    op.drop_column('expenses', 'receipt_url')
    op.drop_column('expenses', 'rejection_reason')
    op.drop_column('expenses', 'approved_at')
    op.drop_column('expenses', 'approved_by')
    op.drop_column('expenses', 'status')
    op.drop_index(op.f('ix_collections_installment_id'), table_name='collections')
    op.drop_index(op.f('ix_collections_consultation_id'), table_name='collections')
    op.drop_table('collections')
    op.drop_index(op.f('ix_borrowed_money_branch_id'), table_name='borrowed_money')
    op.drop_table('borrowed_money')
    sa.Enum(name='expensestatus').drop(op.get_bind())
    sa.Enum(name='borrowstatus').drop(op.get_bind())
    sa.Enum(name='collectionstatus').drop(op.get_bind())
