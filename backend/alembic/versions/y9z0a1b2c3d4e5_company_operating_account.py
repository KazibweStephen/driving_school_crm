"""company operating account ledger

Revision ID: y9z0a1b2c3d4e5
Revises: w3x4y5z6a7b8
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa

revision = "y9z0a1b2c3d4e5"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None

_ENUMS = {
    "operatingentrytype": [
        "equity", "loan", "loan_repayment", "profit",
        "operating_expense", "branch_funding",
    ],
    "operatingdirection": ["credit", "debit"],
}


def upgrade() -> None:
    bind = op.get_bind()
    for name, labels in _ENUMS.items():
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM pg_type WHERE typname = :name "
                "AND typnamespace = 'public'::regnamespace"
            ),
            {"name": name},
        ).first()
        if not exists:
            quoted = "', '".join(labels)
            bind.execute(sa.text(f"CREATE TYPE {name} AS ENUM ('{quoted}')"))

    op.execute(
        """
        CREATE TABLE company_operating_entries (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
            entry_type operatingentrytype NOT NULL,
            direction operatingdirection NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            description TEXT NOT NULL,
            reference VARCHAR(200),
            entry_date DATE,
            loan_entry_id UUID REFERENCES company_operating_entries(id) ON DELETE SET NULL,
            transfer_id UUID REFERENCES branch_transfers(id) ON DELETE SET NULL,
            target_pool VARCHAR(30),
            created_by VARCHAR(20) REFERENCES users(phone),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_company_operating_entries_company_id ON company_operating_entries (company_id)")
    op.execute("CREATE INDEX ix_company_operating_entries_branch_id ON company_operating_entries (branch_id)")
    op.execute("CREATE INDEX ix_company_operating_entries_loan_entry_id ON company_operating_entries (loan_entry_id)")
    op.execute("CREATE INDEX ix_company_operating_entries_transfer_id ON company_operating_entries (transfer_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS company_operating_entries CASCADE")
    for name in _ENUMS:
        op.execute(f"DROP TYPE IF EXISTS {name} CASCADE")
