"""commission_and_lead_redesign

Revision ID: b219a06bb6d7
Revises: b4c5d6e7f8a0
Create Date: 2026-07-13 15:37:07.559224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b219a06bb6d7'
down_revision: Union[str, None] = ('b4c5d6e7f8a0', 'a1b2c3d4e5f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- LEADS table ---
    op.create_table('leads',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('submitted_by_id', sa.String(length=20), nullable=False),
        sa.Column('client_name', sa.String(length=200), nullable=False),
        sa.Column('client_phone', sa.String(length=20), nullable=False),
        sa.Column('location', sa.String(length=300), nullable=True),
        sa.Column('interested_product', sa.String(length=300), nullable=True),
        sa.Column('status', sa.Enum('new', 'contacted', 'converted', 'lost', name='leadstatus'), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('converted_consultation_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['converted_consultation_id'], ['consultations.id'], ),
        sa.ForeignKeyConstraint(['submitted_by_id'], ['users.phone'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_leads_company_id'), 'leads', ['company_id'], unique=False)
    op.create_index(op.f('ix_leads_submitted_by_id'), 'leads', ['submitted_by_id'], unique=False)

    # --- COMMISSION CONTESTS table ---
    op.create_table('commission_contests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('commission_id', sa.UUID(), nullable=False),
        sa.Column('contested_by_id', sa.String(length=20), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('status', sa.Enum('open', 'resolved', name='conteststatus'), nullable=True),
        sa.Column('resolution', sa.Text(), nullable=True),
        sa.Column('resolved_by_id', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['commission_id'], ['commissions.id'], ),
        sa.ForeignKeyConstraint(['contested_by_id'], ['users.phone'], ),
        sa.ForeignKeyConstraint(['resolved_by_id'], ['users.phone'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_commission_contests_commission_id'), 'commission_contests', ['commission_id'], unique=False)
    op.create_index(op.f('ix_commission_contests_contested_by_id'), 'commission_contests', ['contested_by_id'], unique=False)

    # --- COMMISSION_RATES: add new columns (nullable initially), backfill, drop old ---
    op.add_column('commission_rates', sa.Column('package_id', sa.UUID(), nullable=True))
    op.add_column('commission_rates', sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('commission_rates', sa.Column('converter_pct', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('commission_rates', sa.Column('primary_recommender_pct', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('commission_rates', sa.Column('secondary_recommender_pct', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('commission_rates', sa.Column('active_from', sa.Date(), nullable=True))
    op.add_column('commission_rates', sa.Column('active_until', sa.Date(), nullable=True))
    op.add_column('commission_rates', sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_commission_rates_package_id'), 'commission_rates', ['package_id'], unique=False)
    op.create_foreign_key(None, 'commission_rates', 'packages', ['package_id'], ['id'])

    # drop old commission_rates columns
    op.drop_column('commission_rates', 'lesson_type')
    op.drop_column('commission_rates', 'amount')
    op.drop_column('commission_rates', 'name')
    op.drop_column('commission_rates', 'transmission_type')
    op.drop_column('commission_rates', 'is_active')

    # --- COMMISSIONS: add new columns (nullable initially), backfill, drop old ---
    op.add_column('commissions', sa.Column('cart_item_id', sa.UUID(), nullable=True))
    op.add_column('commissions', sa.Column('converter_id', sa.String(length=20), nullable=True))
    op.add_column('commissions', sa.Column('primary_recommender_id', sa.String(length=20), nullable=True))
    op.add_column('commissions', sa.Column('secondary_recommender_id', sa.String(length=20), nullable=True))
    op.add_column('commissions', sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('commissions', sa.Column('converter_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('commissions', sa.Column('primary_recommender_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('commissions', sa.Column('secondary_recommender_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('commissions', sa.Column('contest_status', sa.Enum('open', 'resolved', name='conteststatus'), nullable=True))
    op.create_index(op.f('ix_commissions_cart_item_id'), 'commissions', ['cart_item_id'], unique=False)
    op.create_index(op.f('ix_commissions_converter_id'), 'commissions', ['converter_id'], unique=False)
    op.create_index(op.f('ix_commissions_primary_recommender_id'), 'commissions', ['primary_recommender_id'], unique=False)
    op.create_index(op.f('ix_commissions_secondary_recommender_id'), 'commissions', ['secondary_recommender_id'], unique=False)
    op.drop_index('ix_commissions_client_lesson_id', table_name='commissions')
    op.drop_index('ix_commissions_instructor_id', table_name='commissions')
    op.drop_index('ix_commissions_training_session_id', table_name='commissions')
    op.drop_constraint('commissions_paid_by_fkey', 'commissions', type_='foreignkey')
    op.drop_constraint('commissions_client_lesson_id_fkey', 'commissions', type_='foreignkey')
    op.drop_constraint('commissions_instructor_id_fkey', 'commissions', type_='foreignkey')
    op.drop_constraint('commissions_training_session_id_fkey', 'commissions', type_='foreignkey')
    op.create_foreign_key(None, 'commissions', 'cart_items', ['cart_item_id'], ['id'])
    op.create_foreign_key(None, 'commissions', 'users', ['secondary_recommender_id'], ['phone'])
    op.create_foreign_key(None, 'commissions', 'users', ['converter_id'], ['phone'])
    op.create_foreign_key(None, 'commissions', 'users', ['primary_recommender_id'], ['phone'])
    op.drop_column('commissions', 'amount')
    op.drop_column('commissions', 'paid_by')
    op.drop_column('commissions', 'paid_at')
    op.drop_column('commissions', 'instructor_id')
    op.drop_column('commissions', 'training_session_id')
    op.drop_column('commissions', 'client_lesson_id')

    # --- CART_ITEMS: add is_important ---
    op.add_column('cart_items', sa.Column('is_important', sa.Boolean(), server_default='f', nullable=False))

    # --- CLIENT_AVAILABILITIES: add cart_item_id, start_time, updated_at; drop old columns ---
    op.add_column('client_availabilities', sa.Column('cart_item_id', sa.UUID(), nullable=True))
    op.add_column('client_availabilities', sa.Column('start_time', sa.Time(), nullable=True))
    op.add_column('client_availabilities', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.drop_index('ix_client_availabilities_client_phone', table_name='client_availabilities')
    op.create_index(op.f('ix_client_availabilities_cart_item_id'), 'client_availabilities', ['cart_item_id'], unique=False)
    op.create_foreign_key(None, 'client_availabilities', 'cart_items', ['cart_item_id'], ['id'], ondelete='CASCADE')
    op.drop_column('client_availabilities', 'preferred_lesson_time')
    op.drop_column('client_availabilities', 'client_phone')

    # --- USERROLE enum: add SUPERVISOR ---
    op.execute("ALTER TYPE userrole ADD VALUE 'supervisor'")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM('super_user', 'company_super_user', 'branch_supervisor', 'office_admin', 'instructor', 'manager', 'reception')")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_old")

    op.add_column('client_availabilities', sa.Column('client_phone', sa.VARCHAR(length=20), autoincrement=False, nullable=False))
    op.add_column('client_availabilities', sa.Column('preferred_lesson_time', postgresql.TIME(), autoincrement=False, nullable=True))
    op.drop_constraint(None, 'client_availabilities', type_='foreignkey')
    op.drop_index(op.f('ix_client_availabilities_cart_item_id'), table_name='client_availabilities')
    op.create_index('ix_client_availabilities_client_phone', 'client_availabilities', ['client_phone'], unique=False)
    op.drop_column('client_availabilities', 'updated_at')
    op.drop_column('client_availabilities', 'start_time')
    op.drop_column('client_availabilities', 'cart_item_id')

    op.drop_column('cart_items', 'is_important')

    op.add_column('commissions', sa.Column('client_lesson_id', sa.UUID(), autoincrement=False, nullable=True))
    op.add_column('commissions', sa.Column('training_session_id', sa.UUID(), autoincrement=False, nullable=True))
    op.add_column('commissions', sa.Column('instructor_id', sa.VARCHAR(length=20), autoincrement=False, nullable=False))
    op.add_column('commissions', sa.Column('paid_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True))
    op.add_column('commissions', sa.Column('paid_by', sa.VARCHAR(length=20), autoincrement=False, nullable=True))
    op.add_column('commissions', sa.Column('amount', sa.NUMERIC(precision=10, scale=2), autoincrement=False, nullable=False))
    op.drop_constraint(None, 'commissions', type_='foreignkey')
    op.drop_constraint(None, 'commissions', type_='foreignkey')
    op.drop_constraint(None, 'commissions', type_='foreignkey')
    op.drop_constraint(None, 'commissions', type_='foreignkey')
    op.create_foreign_key('commissions_training_session_id_fkey', 'commissions', 'training_sessions', ['training_session_id'], ['id'])
    op.create_foreign_key('commissions_instructor_id_fkey', 'commissions', 'users', ['instructor_id'], ['phone'])
    op.create_foreign_key('commissions_client_lesson_id_fkey', 'commissions', 'client_lessons', ['client_lesson_id'], ['id'])
    op.create_foreign_key('commissions_paid_by_fkey', 'commissions', 'users', ['paid_by'], ['phone'])
    op.drop_index(op.f('ix_commissions_secondary_recommender_id'), table_name='commissions')
    op.drop_index(op.f('ix_commissions_primary_recommender_id'), table_name='commissions')
    op.drop_index(op.f('ix_commissions_converter_id'), table_name='commissions')
    op.drop_index(op.f('ix_commissions_cart_item_id'), table_name='commissions')
    op.create_index('ix_commissions_training_session_id', 'commissions', ['training_session_id'], unique=False)
    op.create_index('ix_commissions_instructor_id', 'commissions', ['instructor_id'], unique=False)
    op.create_index('ix_commissions_client_lesson_id', 'commissions', ['client_lesson_id'], unique=False)
    op.drop_column('commissions', 'contest_status')
    op.drop_column('commissions', 'secondary_recommender_amount')
    op.drop_column('commissions', 'primary_recommender_amount')
    op.drop_column('commissions', 'converter_amount')
    op.drop_column('commissions', 'total_amount')
    op.drop_column('commissions', 'secondary_recommender_id')
    op.drop_column('commissions', 'primary_recommender_id')
    op.drop_column('commissions', 'converter_id')
    op.drop_column('commissions', 'cart_item_id')

    op.add_column('commission_rates', sa.Column('is_active', sa.BOOLEAN(), autoincrement=False, nullable=True))
    op.add_column('commission_rates', sa.Column('transmission_type', sa.VARCHAR(length=20), autoincrement=False, nullable=True))
    op.add_column('commission_rates', sa.Column('name', sa.VARCHAR(length=200), autoincrement=False, nullable=False))
    op.add_column('commission_rates', sa.Column('amount', sa.NUMERIC(precision=10, scale=2), autoincrement=False, nullable=False))
    op.add_column('commission_rates', sa.Column('lesson_type', sa.VARCHAR(length=50), autoincrement=False, nullable=True))
    op.drop_constraint(None, 'commission_rates', type_='foreignkey')
    op.drop_index(op.f('ix_commission_rates_package_id'), table_name='commission_rates')
    op.drop_column('commission_rates', 'deactivated_at')
    op.drop_column('commission_rates', 'active_until')
    op.drop_column('commission_rates', 'active_from')
    op.drop_column('commission_rates', 'secondary_recommender_pct')
    op.drop_column('commission_rates', 'primary_recommender_pct')
    op.drop_column('commission_rates', 'converter_pct')
    op.drop_column('commission_rates', 'total_amount')
    op.drop_column('commission_rates', 'package_id')

    op.drop_index(op.f('ix_commission_contests_contested_by_id'), table_name='commission_contests')
    op.drop_index(op.f('ix_commission_contests_commission_id'), table_name='commission_contests')
    op.drop_table('commission_contests')
    op.drop_index(op.f('ix_leads_submitted_by_id'), table_name='leads')
    op.drop_index(op.f('ix_leads_company_id'), table_name='leads')
    op.drop_table('leads')
