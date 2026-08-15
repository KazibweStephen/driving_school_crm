"""merge heads

Revision ID: d4c12b2e7a15
Revises: 8d17fe1c8a04, 9f3c26de4e29
Create Date: 2026-08-15 09:08:05.680255

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4c12b2e7a15'
down_revision: Union[str, None] = ('8d17fe1c8a04', '9f3c26de4e29')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
