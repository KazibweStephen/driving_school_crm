"""comprehensive lesson module v2

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-23 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ENUM as PGEnum

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── New enum types (create first, then reference with create_type=False in columns) ──
    for enum_args in [
        (["pending", "scheduled", "ready", "started", "paused", "completed", "repeated", "cancelled", "skipped", "expired"], "lessonstate"),
        (["vehicle_inspection", "cockpit_drill", "driving", "competency", "safety"], "checklisttype"),
        (["not_started", "learning", "practising", "competent", "mastered"], "competencyprogress"),
        (["beginner", "intermediate", "advanced"], "lessondifficulty"),
        (["youtube", "vimeo", "upload", "internal", "qr_code"], "videosource"),
        (["pending", "completed", "failed"], "importstatus"),
        (["scheduled", "in_progress", "completed", "cancelled"], "theorysessionstatus"),
        (["available", "in_use", "maintenance", "decommissioned"], "vehiclestatus"),
    ]:
        try:
            PGEnum(*enum_args[0], name=enum_args[1]).create(op.get_bind())
        except sa.exc.ProgrammingError as e:
            if "already exists" in str(e):
                op.get_bind().rollback()
            else:
                raise

    # ── New tables ──

    # Video Library
    op.create_table(
        "video_library",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("source", PGEnum("youtube", "vimeo", "upload", "internal", "qr_code", name="videosource", create_type=False), nullable=False),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("qr_code_data", sa.Text, nullable=True),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Master Lesson Library
    op.create_table(
        "lesson_library",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("transmission_type", PGEnum("manual", "automatic", "both", name="transmissiontype", create_type=False), nullable=True),
        sa.Column("lesson_objectives", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("practical_objectives", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("competencies", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("estimated_minutes", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("estimated_distance_km", sa.Float, nullable=False, server_default=sa.text("3.0")),
        sa.Column("required_vehicle", sa.String(200), nullable=True),
        sa.Column("difficulty", PGEnum("beginner", "intermediate", "advanced", name="lessondifficulty", create_type=False), nullable=False, server_default=sa.text("'beginner'")),
        sa.Column("status", PGEnum("ACTIVE", "INACTIVE", name="entitystatus", create_type=False), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("lesson_number", sa.Integer, nullable=True),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Lesson Library ↔ Video junction
    op.create_table(
        "lesson_library_videos",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lesson_id", UUID, sa.ForeignKey("lesson_library.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("video_id", UUID, sa.ForeignKey("video_library.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Client Lesson Checklists
    op.create_table(
        "client_lesson_checklists",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_lesson_id", UUID, sa.ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("checklist_type", PGEnum("vehicle_inspection", "cockpit_drill", "driving", "competency", "safety", name="checklisttype", create_type=False), nullable=False),
        sa.Column("item_label", sa.String(300), nullable=False),
        sa.Column("is_checked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("checked_by", sa.String(36), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Client Lesson Competencies
    op.create_table(
        "client_lesson_competencies",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_lesson_id", UUID, sa.ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("competency_name", sa.String(200), nullable=False),
        sa.Column("level", PGEnum("not_started", "learning", "practising", "competent", "mastered", name="competencyprogress", create_type=False), nullable=False, server_default=sa.text("'not_started'")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Client Lesson Timer
    op.create_table(
        "client_lesson_timers",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_lesson_id", UUID, sa.ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True, unique=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_by", sa.String(36), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_by", sa.String(36), nullable=True),
        sa.Column("total_seconds", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("distance_km", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("elapsed_minutes", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'stopped'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Theory Sessions
    op.create_table(
        "theory_sessions",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lesson_plan_id", UUID, sa.ForeignKey("client_lesson_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("session_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=False, server_default=sa.text("120")),
        sa.Column("topic", sa.String(300), nullable=True),
        sa.Column("video_ids", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("slides_url", sa.String(500), nullable=True),
        sa.Column("quiz_data", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("attendance_list", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("instructor_id", sa.String(36), nullable=True),
        sa.Column("status", PGEnum("scheduled", "in_progress", "completed", "cancelled", name="theorysessionstatus", create_type=False), nullable=False, server_default=sa.text("'scheduled'")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Lesson History (Audit Trail)
    op.create_table(
        "lesson_histories",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_lesson_id", UUID, sa.ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_state", PGEnum("pending", "scheduled", "ready", "started", "paused", "completed", "repeated", "cancelled", "skipped", "expired", name="lessonstate", create_type=False), nullable=True),
        sa.Column("to_state", PGEnum("pending", "scheduled", "ready", "started", "paused", "completed", "repeated", "cancelled", "skipped", "expired", name="lessonstate", create_type=False), nullable=True),
        sa.Column("changed_by", sa.String(36), nullable=True),
        sa.Column("change_reason", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Import Logs
    op.create_table(
        "import_logs",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("import_type", sa.String(50), nullable=False),
        sa.Column("file_name", sa.String(500), nullable=True),
        sa.Column("raw_json", JSONB, nullable=True),
        sa.Column("status", PGEnum("pending", "completed", "failed", name="importstatus", create_type=False), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Instructor Qualifications
    op.create_table(
        "instructor_qualifications",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("instructor_phone", sa.String(20), sa.ForeignKey("users.phone", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("transmission_type", PGEnum("manual", "automatic", "both", name="transmissiontype", create_type=False), nullable=False),
        sa.Column("is_certified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("certified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Vehicles
    op.create_table(
        "vehicles",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("plate_number", sa.String(50), unique=True, nullable=False),
        sa.Column("transmission", PGEnum("manual", "automatic", "both", name="transmissiontype", create_type=False), nullable=False),
        sa.Column("status", PGEnum("available", "in_use", "maintenance", "decommissioned", name="vehiclestatus", create_type=False), nullable=False, server_default=sa.text("'available'")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Alter existing tables ──

    # LessonTemplateItem: objectives Text → JSONB
    op.execute("""
        ALTER TABLE lesson_template_items
        ALTER COLUMN lesson_objectives TYPE JSONB
        USING CASE
            WHEN lesson_objectives IS NULL THEN '[]'::jsonb
            ELSE to_jsonb(ARRAY[lesson_objectives])
        END
    """)
    op.execute("""
        ALTER TABLE lesson_template_items
        ALTER COLUMN practical_objectives TYPE JSONB
        USING CASE
            WHEN practical_objectives IS NULL THEN '[]'::jsonb
            ELSE to_jsonb(ARRAY[practical_objectives])
        END
    """)

    # ClientLesson: objectives Text → JSONB
    op.execute("""
        ALTER TABLE client_lessons
        ALTER COLUMN lesson_objectives TYPE JSONB
        USING CASE
            WHEN lesson_objectives IS NULL THEN '[]'::jsonb
            ELSE to_jsonb(ARRAY[lesson_objectives])
        END
    """)
    op.execute("""
        ALTER TABLE client_lessons
        ALTER COLUMN practical_objectives TYPE JSONB
        USING CASE
            WHEN practical_objectives IS NULL THEN '[]'::jsonb
            ELSE to_jsonb(ARRAY[practical_objectives])
        END
    """)

    # ClientLesson: expand status to LessonState
    op.execute("ALTER TABLE client_lessons ALTER COLUMN status DROP DEFAULT")
    op.execute("""
        ALTER TABLE client_lessons
        ALTER COLUMN status TYPE lessonstate
        USING CASE status::text
            WHEN 'pending' THEN 'pending'::lessonstate
            WHEN 'in_progress' THEN 'started'::lessonstate
            WHEN 'completed' THEN 'completed'::lessonstate
            WHEN 'skipped' THEN 'skipped'::lessonstate
            ELSE 'pending'::lessonstate
        END
    """)
    op.execute("ALTER TABLE client_lessons ALTER COLUMN status SET DEFAULT 'pending'::lessonstate")
    op.execute("DROP TYPE IF EXISTS clientlessonstatus")

    # ClientLesson: add new columns
    op.add_column("client_lessons", sa.Column("lesson_library_id", UUID, sa.ForeignKey("lesson_library.id", ondelete="SET NULL"), nullable=True))
    op.add_column("client_lessons", sa.Column("is_locked", sa.Boolean, nullable=False, server_default=sa.text("false")))
    op.add_column("client_lessons", sa.Column("difficulty", PGEnum("beginner", "intermediate", "advanced", name="lessondifficulty", create_type=False), nullable=True))
    op.add_column("client_lessons", sa.Column("outcome", sa.Text, nullable=True))
    op.add_column("client_lessons", sa.Column("instructor_id", sa.String(36), nullable=True))
    op.add_column("client_lessons", sa.Column("vehicle_id", UUID, sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True))

    # ClientLessonPlan: add new columns
    op.add_column("client_lesson_plans", sa.Column("purchased_days", sa.Integer, nullable=True))
    op.add_column("client_lesson_plans", sa.Column("auto_generated", sa.Boolean, nullable=False, server_default=sa.text("false")))

    # LessonPlanTemplate: add new columns
    op.add_column("lesson_plan_templates", sa.Column("status", PGEnum("ACTIVE", "INACTIVE", name="entitystatus", create_type=False), nullable=False, server_default=sa.text("'ACTIVE'")))
    op.add_column("lesson_plan_templates", sa.Column("is_locked", sa.Boolean, nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    # Drop added columns
    op.drop_column("lesson_plan_templates", "is_locked")
    op.drop_column("lesson_plan_templates", "status")
    op.drop_column("client_lesson_plans", "auto_generated")
    op.drop_column("client_lesson_plans", "purchased_days")
    op.drop_column("client_lessons", "vehicle_id")
    op.drop_column("client_lessons", "instructor_id")
    op.drop_column("client_lessons", "outcome")
    op.drop_column("client_lessons", "difficulty")
    op.drop_column("client_lessons", "is_locked")
    op.drop_column("client_lessons", "lesson_library_id")

    # Restore ClientLesson status to clientlessonstatus
    PGEnum("pending", "in_progress", "completed", "skipped", name="clientlessonstatus").create(op.get_bind())
    op.execute("""
        ALTER TABLE client_lessons
        ALTER COLUMN status TYPE clientlessonstatus
        USING CASE status::text
            WHEN 'pending' THEN 'pending'::clientlessonstatus
            WHEN 'started' THEN 'in_progress'::clientlessonstatus
            WHEN 'completed' THEN 'completed'::clientlessonstatus
            WHEN 'skipped' THEN 'skipped'::clientlessonstatus
            ELSE 'pending'::clientlessonstatus
        END
    """)

    # Revert JSONB → Text for objectives (approx — loses array structure)
    op.execute("""
        ALTER TABLE client_lessons
        ALTER COLUMN lesson_objectives TYPE Text
        USING CASE
            WHEN lesson_objectives IS NULL THEN NULL
            ELSE lesson_objectives::text
        END
    """)
    op.execute("""
        ALTER TABLE client_lessons
        ALTER COLUMN practical_objectives TYPE Text
        USING CASE
            WHEN practical_objectives IS NULL THEN NULL
            ELSE practical_objectives::text
        END
    """)
    op.execute("""
        ALTER TABLE lesson_template_items
        ALTER COLUMN lesson_objectives TYPE Text
        USING CASE
            WHEN lesson_objectives IS NULL THEN NULL
            ELSE lesson_objectives::text
        END
    """)
    op.execute("""
        ALTER TABLE lesson_template_items
        ALTER COLUMN practical_objectives TYPE Text
        USING CASE
            WHEN practical_objectives IS NULL THEN NULL
            ELSE practical_objectives::text
        END
    """)

    # Drop new tables
    op.drop_table("vehicles")
    op.drop_table("instructor_qualifications")
    op.drop_table("import_logs")
    op.drop_table("lesson_histories")
    op.drop_table("theory_sessions")
    op.drop_table("client_lesson_timers")
    op.drop_table("client_lesson_competencies")
    op.drop_table("client_lesson_checklists")
    op.drop_table("lesson_library_videos")
    op.drop_table("lesson_library")
    op.drop_table("video_library")

    # Drop new enum types
    op.execute("DROP TYPE IF EXISTS vehiclestatus")
    op.execute("DROP TYPE IF EXISTS theorysessionstatus")
    op.execute("DROP TYPE IF EXISTS importstatus")
    op.execute("DROP TYPE IF EXISTS videosource")
    op.execute("DROP TYPE IF EXISTS lessondifficulty")
    op.execute("DROP TYPE IF EXISTS competencyprogress")
    op.execute("DROP TYPE IF EXISTS checklisttype")
    op.execute("DROP TYPE IF EXISTS lessonstate")
