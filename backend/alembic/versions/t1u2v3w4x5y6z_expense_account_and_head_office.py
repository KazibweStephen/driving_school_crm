"""expense category account + expenses.manage + head-office branches

- Adds an ``account`` column to ``expense_categories`` and ``expenses`` so we can
  flag which fund account (``petty_cash`` / ``client_accounts``) an expense
  belongs to. The known client-related default categories (Permit Payment,
  Learner Permit Payment) are backfilled to ``client_accounts``.
- Grants ``expenses.manage`` to the admin roles (office_admin,
  branch_supervisor, manager, supervisor) for every company so the Expense
  Categories management page is reachable.
- Backfills a "Head Office" branch for every company that does not already have
  one and points ``companies.head_office_branch_id`` at it (idempotent).

Revision ID: t1u2v3w4x5y6z
Revises: s2t3u4v5w6x7y
Create Date: 2026-08-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "t1u2v3w4x5y6z"
down_revision: Union[str, None] = "s2t3u4v5w6x7y"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. account column on expense_categories (with backfill for client accounts)
    op.add_column(
        "expense_categories",
        sa.Column("account", sa.String(20), nullable=False, server_default=sa.text("'petty_cash'")),
    )
    op.execute(
        "UPDATE expense_categories SET account = 'client_accounts' "
        "WHERE code IN ('permit_payment', 'learner_permit_payment')"
    )

    # 2. account column on expenses (nullable, mirrored at creation time)
    op.add_column(
        "expenses",
        sa.Column("account", sa.String(20), nullable=True),
    )

    # 3. grant expenses.manage to admin roles for existing companies
    op.execute(
        """
        INSERT INTO role_permissions (company_id, role, permission)
        SELECT DISTINCT company_id, role, 'expenses.manage'
        FROM role_permissions
        WHERE role IN ('office_admin', 'branch_supervisor', 'manager', 'supervisor')
        ON CONFLICT (company_id, role, permission) DO NOTHING
        """
    )

    # 4. Backfill a Head Office branch for every company (idempotent)
    op.execute(
        """
        DO $$
        DECLARE
            c RECORD;
            existing UUID;
        BEGIN
            FOR c IN SELECT id FROM companies LOOP
                SELECT id INTO existing
                FROM branches
                WHERE company_id = c.id AND lower(name) = 'head office'
                LIMIT 1;
                IF existing IS NULL THEN
                    SELECT id INTO existing
                    FROM branches
                    WHERE company_id = c.id AND code = 'HEAD_OFFICE'
                    LIMIT 1;
                END IF;
                IF existing IS NULL THEN
                    BEGIN
                        INSERT INTO branches (id, company_id, name, code, address, phone, email, is_active, created_at, updated_at)
                        VALUES (gen_random_uuid(), c.id, 'Head Office', 'HEAD_OFFICE', NULL, NULL, NULL, true, now(), now())
                        RETURNING id INTO existing;
                    EXCEPTION WHEN unique_violation THEN
                        SELECT id INTO existing
                        FROM branches
                        WHERE company_id = c.id AND code = 'HEAD_OFFICE'
                        LIMIT 1;
                    END;
                END IF;
                IF existing IS NOT NULL THEN
                    UPDATE companies SET head_office_branch_id = existing WHERE id = c.id;
                END IF;
            END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        "UPDATE companies SET head_office_branch_id = NULL "
        "WHERE EXISTS (SELECT 1 FROM branches b WHERE b.id = companies.head_office_branch_id AND b.code = 'HEAD_OFFICE')"
    )
    op.execute("DELETE FROM branches WHERE code = 'HEAD_OFFICE'")
    op.execute("DELETE FROM role_permissions WHERE permission = 'expenses.manage'")
    op.drop_column("expenses", "account")
    op.drop_column("expense_categories", "account")
