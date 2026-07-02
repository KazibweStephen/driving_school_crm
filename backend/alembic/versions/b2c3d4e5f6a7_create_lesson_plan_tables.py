"""create lesson plan tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-21 17:56:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lesson_plan_templates",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("transmission_type", sa.Enum("manual", "automatic", "both", name="transmissiontype"), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("total_days", sa.Integer, nullable=False, server_default=sa.text("20")),
        sa.Column("total_weeks", sa.Integer, nullable=False, server_default=sa.text("4")),
        sa.Column("created_by_phone", sa.String(50), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "lesson_template_items",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("template_id", UUID, sa.ForeignKey("lesson_plan_templates.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("day_number", sa.Integer, nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("lesson_objectives", sa.Text, nullable=True),
        sa.Column("practical_objectives", sa.Text, nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "client_lesson_plans",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("cart_item_id", UUID, sa.ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_id", UUID, sa.ForeignKey("lesson_plan_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("transmission_type", sa.Enum("manual", "automatic", "both", name="transmissiontype"), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Enum("active", "completed", name="lessonplanstatus"), nullable=False, server_default=sa.text("'active'")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "client_lessons",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lesson_plan_id", UUID, sa.ForeignKey("client_lesson_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_item_id", UUID, sa.ForeignKey("lesson_template_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("day_number", sa.Integer, nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("lesson_objectives", sa.Text, nullable=True),
        sa.Column("practical_objectives", sa.Text, nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.Enum("pending", "in_progress", "completed", "skipped", name="clientlessonstatus"), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("driving_minutes", sa.Integer, nullable=True),
        sa.Column("theory_minutes", sa.Integer, nullable=True),
        sa.Column("mileage_km", sa.Float, nullable=True),
        sa.Column("combined_with_next", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("skills_achieved", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("client_lessons")
    op.drop_table("client_lesson_plans")
    op.drop_table("lesson_template_items")
    op.drop_table("lesson_plan_templates")
    op.execute("DROP TYPE IF EXISTS clientlessonstatus")
    op.execute("DROP TYPE IF EXISTS lessonplanstatus")
    op.execute("DROP TYPE IF EXISTS transmissiontype")
