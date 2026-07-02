"""fix entitystatus enum values to lowercase

Revision ID: 6d6f3d2f0547
Revises: c3d4e5f6a7b8
Create Date: 2026-06-23 16:40:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "6d6f3d2f0547"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE entitystatus RENAME TO entitystatus_old")
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
    op.execute("DROP TYPE entitystatus_old")


def downgrade() -> None:
    op.execute("ALTER TYPE entitystatus RENAME TO entitystatus_new")
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
    op.execute("DROP TYPE entitystatus_new")
