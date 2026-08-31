"""operating posts + package expected expenses

Revision ID: a1a2a3a4a5a6a7
Revises: z0a1b2c3d4e5f6
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa

revision = "a1a2a3a4a5a6a7"
down_revision = "z0a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # extend operating entry-type enum with client-account post/repay values
    for value in ("client_account_post", "account_repay"):
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                "WHERE t.typname = 'operatingentrytype' AND e.enumlabel = :v"
            ),
            {"v": value},
        ).first()
        if not exists:
            bind.execute(sa.text(f"ALTER TYPE operatingentrytype ADD VALUE IF NOT EXISTS '{value}'"))

    # add consultation + repay link columns to operating entries
    cols = bind.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'company_operating_entries' AND column_name = :c"
        ),
        {"c": "consultation_id"},
    ).first()
    if not cols:
        op.execute(
            "ALTER TABLE company_operating_entries "
            "ADD COLUMN consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL, "
            "ADD COLUMN repays_entry_id UUID REFERENCES company_operating_entries(id) ON DELETE SET NULL"
        )
        op.execute("CREATE INDEX ix_company_operating_entries_consultation_id ON company_operating_entries (consultation_id)")
        op.execute("CREATE INDEX ix_company_operating_entries_repays_entry_id ON company_operating_entries (repays_entry_id)")

    # package expected expenses
    op.execute(
        """
        CREATE TABLE package_expected_expenses (
            id UUID PRIMARY KEY,
            package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
            category VARCHAR(100) NOT NULL,
            amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_package_expected_expense_category UNIQUE (package_id, category)
        )
        """
    )
    op.execute("CREATE INDEX ix_package_expected_expenses_package_id ON package_expected_expenses (package_id)")

    # operating client posts (tracks excess taken per account + reconciled)
    op.execute(
        """
        CREATE TABLE operating_client_posts (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
            entry_id UUID REFERENCES company_operating_entries(id) ON DELETE SET NULL,
            expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
            amount NUMERIC(12,2) NOT NULL,
            confirmed_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
            excess NUMERIC(12,2) NOT NULL DEFAULT 0,
            reconciled NUMERIC(12,2) NOT NULL DEFAULT 0,
            notes TEXT,
            created_by VARCHAR(20) REFERENCES users(phone),
            created_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_operating_client_posts_company_id ON operating_client_posts (company_id)")
    op.execute("CREATE INDEX ix_operating_client_posts_consultation_id ON operating_client_posts (consultation_id)")
    op.execute("CREATE INDEX ix_operating_client_posts_entry_id ON operating_client_posts (entry_id)")
    op.execute("CREATE INDEX ix_operating_client_posts_expense_id ON operating_client_posts (expense_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS operating_client_posts CASCADE")
    op.execute("DROP TABLE IF EXISTS package_expected_expenses CASCADE")
    op.execute("ALTER TABLE company_operating_entries DROP CONSTRAINT IF EXISTS company_operating_entries_consultation_id_fkey")
    op.execute("ALTER TABLE company_operating_entries DROP CONSTRAINT IF EXISTS company_operating_entries_repays_entry_id_fkey")
    op.execute("ALTER TABLE company_operating_entries DROP COLUMN IF EXISTS consultation_id")
    op.execute("ALTER TABLE company_operating_entries DROP COLUMN IF EXISTS repays_entry_id")
