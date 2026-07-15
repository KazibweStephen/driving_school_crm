"""competency catalogue

Revision ID: d4e5f6a7b8c9
Revises: b219a06bb6d7
Create Date: 2026-07-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ENUM as PGEnum

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "j2k3l4m5n6o7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── New enum types ──
    for enum_args in [
        (["beginner", "intermediate", "advanced"], "competencydifficulty"),
        (["driving", "motorcycle", "truck", "bus", "general"], "competencytrainingcategory"),
        (["draft", "active", "archived"], "competencyversionstatus"),
    ]:
        try:
            PGEnum(*enum_args[0], name=enum_args[1]).create(op.get_bind())
        except sa.exc.ProgrammingError as e:
            if "already exists" in str(e):
                op.get_bind().rollback()
            else:
                raise

    # ── competency_versions ──
    op.create_table(
        "competency_versions",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", PGEnum("draft", "active", "archived", name="competencyversionstatus", create_type=False), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "version", name="uq_competency_version_company"),
    )

    # ── competency_categories ──
    op.create_table(
        "competency_categories",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "name", name="uq_competency_category_company"),
    )

    # ── competencies ──
    op.create_table(
        "competencies",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("version_id", UUID, sa.ForeignKey("competency_versions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category_id", UUID, sa.ForeignKey("competency_categories.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("company_id", UUID, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("learning_outcome", sa.Text, nullable=True),
        sa.Column("assessment_criteria", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("difficulty", PGEnum("beginner", "intermediate", "advanced", name="competencydifficulty", create_type=False), nullable=False, server_default=sa.text("'beginner'")),
        sa.Column("estimated_practice_minutes", sa.Integer, nullable=True),
        sa.Column("training_category", PGEnum("driving", "motorcycle", "truck", "bus", "general", name="competencytrainingcategory", create_type=False), nullable=False, server_default=sa.text("'driving'")),
        sa.Column("display_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "version_id", "code", name="uq_competency_version_code"),
    )

    # ── competency_prerequisites ──
    op.create_table(
        "competency_prerequisites",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("competency_id", UUID, sa.ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("prerequisite_id", UUID, sa.ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("competency_id", "prerequisite_id", name="uq_competency_prerequisite"),
    )

    # ── lesson_competencies (junction table) ──
    op.create_table(
        "lesson_competencies",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lesson_library_id", UUID, sa.ForeignKey("lesson_library.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("competency_id", UUID, sa.ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("lesson_library_id", "competency_id", name="uq_lesson_competency"),
    )

    # ── Drop old JSONB columns from lesson_library ──
    op.drop_column("lesson_library", "competencies")
    op.drop_column("lesson_library", "prerequisite_competencies")


def downgrade() -> None:
    # Re-add dropped columns
    op.add_column("lesson_library", sa.Column("competencies", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")))
    op.add_column("lesson_library", sa.Column("prerequisite_competencies", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")))

    op.drop_table("lesson_competencies")
    op.drop_table("competency_prerequisites")
    op.drop_table("competencies")
    op.drop_table("competency_categories")
    op.drop_table("competency_versions")

    for name in ["competencyversionstatus", "competencytrainingcategory", "competencydifficulty"]:
        PGEnum(name=name).drop(op.get_bind())
