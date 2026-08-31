"""expected expense catalogue + package links + cart snapshot

Revision ID: b1c2d3e4f5a6
Revises: a1a2a3a4a5a6a7
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa

revision = "b1c2d3e4f5a6"
down_revision = "a1a2a3a4a5a6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    table_exists = op.get_bind().execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'expected_expense_items'"
        )
    ).first()
    if not table_exists:
        op.execute(
            """
            CREATE TABLE expected_expense_items (
                id UUID PRIMARY KEY,
                company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
                unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
                default_multiplier NUMERIC(12,2) NOT NULL DEFAULT 1,
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
        op.execute(
            "CREATE INDEX ix_expected_expense_items_company_id ON expected_expense_items (company_id)"
        )
        op.execute(
            "CREATE INDEX ix_expected_expense_items_category_id ON expected_expense_items (category_id)"
        )

    link_exists = op.get_bind().execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'package_expense_links'"
        )
    ).first()
    if not link_exists:
        op.execute(
            """
            CREATE TABLE package_expense_links (
                id UUID PRIMARY KEY,
                package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
                item_id UUID NOT NULL REFERENCES expected_expense_items(id) ON DELETE CASCADE,
                multiplier NUMERIC(12,2) NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ DEFAULT now(),
                CONSTRAINT uq_package_expense_link UNIQUE (package_id, item_id)
            )
            """
        )
        op.execute(
            "CREATE INDEX ix_package_expense_links_package_id ON package_expense_links (package_id)"
        )
        op.execute(
            "CREATE INDEX ix_package_expense_links_item_id ON package_expense_links (item_id)"
        )

    col_exists = op.get_bind().execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'cart_items' AND column_name = 'expected_expense_snapshot'"
        )
    ).first()
    if not col_exists:
        op.execute(
            "ALTER TABLE cart_items ADD COLUMN expected_expense_snapshot NUMERIC(12,2)"
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS package_expense_links CASCADE")
    op.execute("DROP TABLE IF EXISTS expected_expense_items CASCADE")
    op.execute("ALTER TABLE cart_items DROP COLUMN IF EXISTS expected_expense_snapshot")
