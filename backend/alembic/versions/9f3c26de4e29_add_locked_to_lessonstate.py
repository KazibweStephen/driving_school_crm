"""add_locked_to_lessonstate

Revision ID: 9f3c26de4e29
Revises: 122158b1ace5
Create Date: 2026-08-14 17:42:03.231571

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f3c26de4e29'
down_revision: Union[str, None] = '122158b1ace5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE lessonstate ADD VALUE IF NOT EXISTS 'locked'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values; skip
    pass
