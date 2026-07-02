"""fix entitystatus enum back to uppercase to match ORM serialization

Revision ID: 7e8f9a0b1c2d
Revises: 6d6f3d2f0547
Create Date: 2026-06-23 16:50:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "7e8f9a0b1c2d"
down_revision: Union[str, None] = "6d6f3d2f0547"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE entitystatus RENAME TO entitystatus_lower")
    op.execute("CREATE TYPE entitystatus AS ENUM ('ACTIVE', 'INACTIVE')")
    for table, col in [
        ("products", "status"),
        ("packages", "status"),
        ("lesson_plan_templates", "status"),
        ("lesson_library", "status"),
    ]:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT")
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {col} "
            f"TYPE entitystatus USING UPPER({col}::text)::entitystatus"
        )
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {col} "
            f"SET DEFAULT 'ACTIVE'::entitystatus"
        )
    op.execute("DROP TYPE entitystatus_lower")


def downgrade() -> None:
    op.execute("ALTER TYPE entitystatus RENAME TO entitystatus_upper")
    op.execute("CREATE TYPE entitystatus AS ENUM ('active', 'inactive')")
    for table, col in [
        ("products", "status"),
        ("packages", "status"),
        ("lesson_plan_templates", "status"),
        ("lesson_library", "status"),
    ]:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT")
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {col} "
            f"TYPE entitystatus USING LOWER({col}::text)::entitystatus"
        )
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {col} "
            f"SET DEFAULT 'active'::entitystatus"
        )
    op.execute("DROP TYPE entitystatus_upper")
