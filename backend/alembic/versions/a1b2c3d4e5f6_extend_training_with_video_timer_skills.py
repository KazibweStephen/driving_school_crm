"""extend training session with video/timer/skills

Revision ID: a1b2c3d4e5f6
Revises: e07e7f5b5c50
Create Date: 2026-06-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e07e7f5b5c50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to training_sessions
    op.add_column("training_sessions", sa.Column("video_url", sa.String(500), nullable=True))
    op.add_column("training_sessions", sa.Column("video_cached", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("training_sessions", sa.Column("video_invalidated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("training_sessions", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("training_sessions", sa.Column("started_by", sa.String(36), nullable=True))
    op.add_column("training_sessions", sa.Column("timer_seconds", sa.Integer(), nullable=True))
    op.add_column("training_sessions", sa.Column("timer_started_at", sa.DateTime(timezone=True), nullable=True))

    # Create skills table
    op.create_table(
        "skills",
        sa.Column("id", UUID(), nullable=False),
        sa.Column("training_session_id", UUID(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("competency_level", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("achieved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["training_session_id"], ["training_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_skills_training_session_id"), "skills", ["training_session_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_skills_training_session_id"), table_name="skills")
    op.drop_table("skills")
    op.drop_column("training_sessions", "timer_started_at")
    op.drop_column("training_sessions", "timer_seconds")
    op.drop_column("training_sessions", "started_by")
    op.drop_column("training_sessions", "started_at")
    op.drop_column("training_sessions", "video_invalidated")
    op.drop_column("training_sessions", "video_cached")
    op.drop_column("training_sessions", "video_url")
