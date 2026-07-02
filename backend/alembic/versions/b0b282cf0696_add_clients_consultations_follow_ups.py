"""add clients consultations follow_ups

Revision ID: b0b282cf0696
Revises: 091ae657b226
Create Date: 2026-06-13 16:58:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b0b282cf0696"
down_revision: Union[str, None] = "091ae657b226"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("middle_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("alternative_phones", postgresql.JSON(), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("how_they_knew_us", sa.String(200), nullable=True),
        sa.Column("nin", sa.String(50), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "INACTIVE", name="entitystatus", create_type=False),
            nullable=False,
        ),
        sa.Column("created_by_phone", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clients_phone"), "clients", ["phone"], unique=True)

    op.create_table(
        "consultations",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("client_id", postgresql.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("NEW", "CONSULTING", "CONVERTED", "LOST", name="consultationstatus"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("conducted_by_phone", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "follow_ups",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("consultation_id", postgresql.UUID(), nullable=False),
        sa.Column("follow_up_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("PENDING", "COMPLETED", "CANCELLED", name="followupstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["consultation_id"], ["consultations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("follow_ups")
    op.drop_table("consultations")
    op.drop_table("clients")
    op.execute("DROP TYPE IF EXISTS consultationstatus")
    op.execute("DROP TYPE IF EXISTS followupstatus")
