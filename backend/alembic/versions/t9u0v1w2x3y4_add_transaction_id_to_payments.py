"""Add transaction_id to payments.

Unique 12-digit numeric transaction id (TID) per payment, printed on the
receipt and encoded in the receipt barcode. Backfills existing payments.

Revision ID: t9u0v1w2x3y4
Revises: s7t8u9v0w1x2
Create Date: 2026-08-10 08:00:00.000000+00:00
"""

import random

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "t9u0v1w2x3y4"
down_revision = "s7t8u9v0w1x2"
branch_labels = None
depends_on = None


def _tid_exists(conn, tid: str) -> bool:
    row = conn.execute(
        sa.text("SELECT 1 FROM payments WHERE transaction_id = :t"), {"t": tid}
    ).first()
    return row is not None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("transaction_id", sa.String(length=12), nullable=True),
    )

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id FROM payments")).fetchall()
    for (payment_id,) in rows:
        for _ in range(50):
            tid = f"{random.randrange(10**12):012d}"
            if not _tid_exists(connection, tid):
                connection.execute(
                    sa.text("UPDATE payments SET transaction_id = :t WHERE id = :id"),
                    {"t": tid, "id": payment_id},
                )
                break

    op.alter_column("payments", "transaction_id", nullable=False)
    op.create_unique_constraint("uq_payments_transaction_id", "payments", ["transaction_id"])
    op.create_index("ix_payments_transaction_id", "payments", ["transaction_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_transaction_id", table_name="payments")
    op.drop_constraint("uq_payments_transaction_id", "payments", type_="unique")
    op.drop_column("payments", "transaction_id")
