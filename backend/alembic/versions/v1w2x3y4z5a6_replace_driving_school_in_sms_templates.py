"""Replace 'Driving School' with {company_name} placeholder in existing SMS templates.

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
Create Date: 2026-08-11 00:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "v1w2x3y4z5a6"
down_revision = "u0v1w2x3y4z5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE sms_templates SET body = REPLACE(body, 'Driving School', '{company_name}') "
        "WHERE body LIKE '%Driving School%'"
    )


def downgrade() -> None:
    # Not reversible safely because we cannot know the original company names.
    pass
