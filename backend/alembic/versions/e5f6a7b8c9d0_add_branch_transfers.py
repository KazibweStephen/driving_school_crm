"""add branch transfers

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ENUM as PGEnum

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        PGEnum(
            "initiated", "received", "cancelled", name="transferstatus"
        ).create(op.get_bind())
    except sa.exc.ProgrammingError as e:
        if "already exists" in str(e):
            op.get_bind().rollback()
        else:
            raise

    op.create_table(
        "branch_transfers",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("from_branch_id", UUID, sa.ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("to_branch_id", UUID, sa.ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("consultation_id", UUID, sa.ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("status", PGEnum("initiated", "received", "cancelled", name="transferstatus", create_type=False), nullable=False, server_default=sa.text("'initiated'")),
        sa.Column("initiated_by", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("initiated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("received_by", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("branch_transfers")
    try:
        PGEnum(name="transferstatus").drop(op.get_bind())
    except sa.exc.ProgrammingError:
        op.get_bind().rollback()
