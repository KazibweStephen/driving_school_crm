"""client account fundings (branch-level client-to-client funding)

Adds the `client_account_fundings` audit table, which records money moved
from one client's expense account into another client's expense account at
the *same* branch. An overdrawn client account has no way to be topped up
today (the only source of client-account money is a payment from that same
client), so permit/IOV expenses get blocked by the per-client posting cap.

Also seeds the new `client_accounts` permission group for every company
whose role already holds `transfers.view` (office_admin, branch_supervisor,
manager, supervisor) so no existing company loses access.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f4a5b6c7d8e9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None

_ENUM_NAME = "clientaccountfundingstatus"
_LABELS = ["active", "cancelled"]

PERM_CODES = (
    "client_accounts.manage",
    "client_accounts.view",
    "client_accounts.fund",
)
# Roles that hold `transfers.view` in `_DEFAULT_MATRIX` — funding client
# accounts is a money movement, so it follows the branch-transfer audience.
PERM_ROLES = ("office_admin", "branch_supervisor", "manager", "supervisor")


def upgrade() -> None:
    bind = op.get_bind()

    exists = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_type WHERE typname = :name "
            "AND typnamespace = 'public'::regnamespace"
        ),
        {"name": _ENUM_NAME},
    ).first()
    if not exists:
        quoted = "', '".join(_LABELS)
        bind.execute(sa.text(f"CREATE TYPE {_ENUM_NAME} AS ENUM ('{quoted}')"))

    op.create_table(
        "client_account_fundings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("from_consultation_id", sa.Uuid(), nullable=False),
        sa.Column("to_consultation_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(*_LABELS, name=_ENUM_NAME, create_type=False),
            server_default="active",
            nullable=False,
        ),
        sa.Column("initiated_by", sa.String(), nullable=True),
        sa.Column(
            "initiated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("cancelled_by", sa.String(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"], ["branches.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["from_consultation_id"], ["consultations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["to_consultation_id"], ["consultations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["initiated_by"], ["users.phone"]),
        sa.ForeignKeyConstraint(["cancelled_by"], ["users.phone"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_client_account_fundings_branch_id", "client_account_fundings", ["branch_id"]
    )
    op.create_index(
        "ix_client_account_fundings_from_consultation_id",
        "client_account_fundings",
        ["from_consultation_id"],
    )
    op.create_index(
        "ix_client_account_fundings_to_consultation_id",
        "client_account_fundings",
        ["to_consultation_id"],
    )
    op.create_index(
        "ix_client_account_fundings_status", "client_account_fundings", ["status"]
    )

    for role in PERM_ROLES:
        for code in PERM_CODES:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO role_permissions (company_id, role, permission)
                    SELECT c.id, CAST(:role AS userrole), :permission
                    FROM companies c
                    WHERE EXISTS (
                        SELECT 1 FROM role_permissions r
                        WHERE r.company_id = c.id
                          AND r.role = CAST(:role AS userrole)
                          AND r.permission = 'transfers.view'
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM role_permissions r2
                        WHERE r2.company_id = c.id
                          AND r2.role = CAST(:role AS userrole)
                          AND r2.permission = :permission
                    )
                    """
                ),
                {"role": role, "permission": code},
            )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_client_account_fundings_status", table_name="client_account_fundings")
    op.drop_index(
        "ix_client_account_fundings_to_consultation_id",
        table_name="client_account_fundings",
    )
    op.drop_index(
        "ix_client_account_fundings_from_consultation_id",
        table_name="client_account_fundings",
    )
    op.drop_index("ix_client_account_fundings_branch_id", table_name="client_account_fundings")
    op.drop_table("client_account_fundings")

    for role in PERM_ROLES:
        for code in PERM_CODES:
            bind.execute(
                sa.text(
                    """
                    DELETE FROM role_permissions
                    WHERE role = CAST(:role AS userrole) AND permission = :permission
                    """
                ),
                {"role": role, "permission": code},
            )

    bind.execute(sa.text(f"DROP TYPE IF EXISTS {_ENUM_NAME}"))
