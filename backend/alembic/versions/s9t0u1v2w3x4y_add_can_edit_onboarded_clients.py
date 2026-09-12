"""add can_edit_onboarded_clients to users

Revision ID: s9t0u1v2w3x4y
Revises: r8s9t0u1v2w3x4
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision: str = "s9t0u1v2w3x4y"
down_revision: str | None = "r8s9t0u1v2w3x4"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "can_edit_onboarded_clients",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "can_edit_onboarded_clients")