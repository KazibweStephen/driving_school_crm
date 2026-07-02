import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.product import EntityStatus

_values_callable = lambda x: [e.value for e in x]


class TransmissionType(str, enum.Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"
    BOTH = "both"


class LessonPlanStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"


class LessonState(str, enum.Enum):
    PENDING = "pending"
    SCHEDULED = "scheduled"
    READY = "ready"
    STARTED = "started"
    PAUSED = "paused"
    COMPLETED = "completed"
    REPEATED = "repeated"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"
    EXPIRED = "expired"


class ChecklistType(str, enum.Enum):
    VEHICLE_INSPECTION = "vehicle_inspection"
    COCKPIT_DRILL = "cockpit_drill"
    DRIVING = "driving"
    COMPETENCY = "competency"
    SAFETY = "safety"


class CompetencyProgress(str, enum.Enum):
    NOT_STARTED = "not_started"
    LEARNING = "learning"
    PRACTISING = "practising"
    COMPETENT = "competent"
    MASTERED = "mastered"


class LessonDifficulty(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class VideoSource(str, enum.Enum):
    YOUTUBE = "youtube"
    VIMEO = "vimeo"
    UPLOAD = "upload"
    INTERNAL = "internal"
    QR_CODE = "qr_code"


class ImportStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class TheorySessionStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    DECOMMISSIONED = "decommissioned"


# ── Video Library ──


class VideoLibrary(Base):
    __tablename__ = "video_library"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    source: Mapped[VideoSource] = mapped_column(
        Enum(VideoSource, values_callable=_values_callable), nullable=False
    )
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    qr_code_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lessons: Mapped[list["LessonLibrary"]] = relationship(
        "LessonLibrary", secondary="lesson_library_videos",
        back_populates="videos"
    )


# ── Lesson Plan Template ──


class LessonPlanTemplate(Base):
    __tablename__ = "lesson_plan_templates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    transmission_type: Mapped[TransmissionType] = mapped_column(
        Enum(TransmissionType, values_callable=_values_callable), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_days: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    total_weeks: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus),
        default=EntityStatus.ACTIVE, nullable=False
    )

    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lesson_items: Mapped[list["LessonTemplateItem"]] = relationship(
        "LessonTemplateItem", back_populates="template", cascade="all, delete-orphan",
        order_by="LessonTemplateItem.day_number"
    )
    client_plans: Mapped[list["ClientLessonPlan"]] = relationship(
        "ClientLessonPlan", back_populates="template"
    )


class LessonTemplateItem(Base):
    __tablename__ = "lesson_template_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lesson_plan_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    lesson_objectives: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    practical_objectives: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    estimated_distance_km: Mapped[float] = mapped_column(Float, default=3.0, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lesson_library_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("lesson_library.id", ondelete="SET NULL"), nullable=True, index=True
    )
    preferred_location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    enforce_prerequisites: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    template: Mapped["LessonPlanTemplate"] = relationship("LessonPlanTemplate", back_populates="lesson_items")
    lesson_library: Mapped["LessonLibrary | None"] = relationship("LessonLibrary", foreign_keys=[lesson_library_id])


# ── Client Lesson Plan ──


class ClientLessonPlan(Base):
    __tablename__ = "client_lesson_plans"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cart_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lesson_plan_templates.id", ondelete="SET NULL"), nullable=True
    )
    transmission_type: Mapped[TransmissionType] = mapped_column(
        Enum(TransmissionType, values_callable=_values_callable), nullable=False
    )
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[LessonPlanStatus] = mapped_column(
        Enum(LessonPlanStatus, values_callable=_values_callable),
        default=LessonPlanStatus.ACTIVE, nullable=False
    )
    purchased_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cart_item: Mapped["CartItem"] = relationship("CartItem")
    template: Mapped["LessonPlanTemplate | None"] = relationship("LessonPlanTemplate", back_populates="client_plans")
    lessons: Mapped[list["ClientLesson"]] = relationship(
        "ClientLesson", back_populates="plan", cascade="all, delete-orphan",
        order_by="ClientLesson.order"
    )
    theory_sessions: Mapped[list["TheorySession"]] = relationship(
        "TheorySession", back_populates="plan", cascade="all, delete-orphan"
    )


class ClientLesson(Base):
    __tablename__ = "client_lessons"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesson_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_lesson_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lesson_template_items.id", ondelete="SET NULL"), nullable=True
    )
    lesson_library_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lesson_library.id", ondelete="SET NULL"), nullable=True
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    lesson_objectives: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    practical_objectives: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[LessonState] = mapped_column(
        Enum(LessonState, values_callable=_values_callable),
        default=LessonState.PENDING, nullable=False
    )
    difficulty: Mapped[LessonDifficulty | None] = mapped_column(
        Enum(LessonDifficulty, values_callable=_values_callable), nullable=True
    )
    # Actual session tracking
    driving_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    theory_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mileage_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    combined_with_next: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    skills_achieved: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=list)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    enforce_prerequisites: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan: Mapped["ClientLessonPlan"] = relationship("ClientLessonPlan", back_populates="lessons")
    checklists: Mapped[list["ClientLessonChecklist"]] = relationship(
        "ClientLessonChecklist", back_populates="lesson", cascade="all, delete-orphan"
    )
    competencies: Mapped[list["ClientLessonCompetency"]] = relationship(
        "ClientLessonCompetency", back_populates="lesson", cascade="all, delete-orphan"
    )
    timer: Mapped["ClientLessonTimer | None"] = relationship(
        "ClientLessonTimer", back_populates="lesson", uselist=False, cascade="all, delete-orphan"
    )
    histories: Mapped[list["LessonHistory"]] = relationship(
        "LessonHistory", back_populates="lesson", cascade="all, delete-orphan"
    )
    vehicle: Mapped["Vehicle | None"] = relationship("Vehicle")


# ── Master Lesson Library ──


class LessonLibrary(Base):
    __tablename__ = "lesson_library"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    transmission_type: Mapped[TransmissionType | None] = mapped_column(
        Enum(TransmissionType, values_callable=_values_callable), nullable=True
    )
    lesson_objectives: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    practical_objectives: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    competencies: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    estimated_distance_km: Mapped[float] = mapped_column(Float, default=3.0, nullable=False)
    required_vehicle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    difficulty: Mapped[LessonDifficulty] = mapped_column(
        Enum(LessonDifficulty, values_callable=_values_callable),
        default=LessonDifficulty.BEGINNER, nullable=False
    )
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus),
        default=EntityStatus.ACTIVE, nullable=False
    )
    lesson_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    day_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    week_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    training_category: Mapped[str] = mapped_column(String(50), default="driving", nullable=False)
    prerequisite_competencies: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    videos: Mapped[list["VideoLibrary"]] = relationship(
        "VideoLibrary", secondary="lesson_library_videos",
        back_populates="lessons", order_by="LessonLibraryVideo.order"
    )
    prerequisite_lessons: Mapped[list["LessonLibrary"]] = relationship(
        "LessonLibrary",
        secondary="lesson_prerequisites",
        primaryjoin="LessonLibrary.id == lesson_prerequisites.c.lesson_id",
        secondaryjoin="LessonLibrary.id == lesson_prerequisites.c.prerequisite_lesson_id",
        backref="required_by",
    )


class LessonPrerequisite(Base):
    __tablename__ = "lesson_prerequisites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lesson_library.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prerequisite_lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lesson_library.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LessonLibraryVideo(Base):
    __tablename__ = "lesson_library_videos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lesson_library.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("video_library.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ── Client Lesson Checklists ──


class ClientLessonChecklist(Base):
    __tablename__ = "client_lesson_checklists"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    client_lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checklist_type: Mapped[ChecklistType] = mapped_column(
        Enum(ChecklistType, values_callable=_values_callable), nullable=False
    )
    item_label: Mapped[str] = mapped_column(String(300), nullable=False)
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    checked_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lesson: Mapped["ClientLesson"] = relationship("ClientLesson", back_populates="checklists")


# ── Client Lesson Competencies ──


class ClientLessonCompetency(Base):
    __tablename__ = "client_lesson_competencies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    client_lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    competency_name: Mapped[str] = mapped_column(String(200), nullable=False)
    level: Mapped[CompetencyProgress] = mapped_column(
        Enum(CompetencyProgress, values_callable=_values_callable),
        default=CompetencyProgress.NOT_STARTED, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lesson: Mapped["ClientLesson"] = relationship("ClientLesson", back_populates="competencies")


# ── Client Lesson Timer ──


class ClientLessonTimer(Base):
    __tablename__ = "client_lesson_timers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    client_lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True, unique=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    total_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    elapsed_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="stopped", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lesson: Mapped["ClientLesson"] = relationship("ClientLesson", back_populates="timer")


# ── Theory Session ──


class TheorySession(Base):
    __tablename__ = "theory_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesson_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_lesson_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    session_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=120, nullable=False)
    topic: Mapped[str | None] = mapped_column(String(300), nullable=True)
    video_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    slides_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quiz_data: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    attendance_list: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    instructor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[TheorySessionStatus] = mapped_column(
        Enum(TheorySessionStatus, values_callable=_values_callable),
        default=TheorySessionStatus.SCHEDULED, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan: Mapped["ClientLessonPlan"] = relationship("ClientLessonPlan", back_populates="theory_sessions")


# ── Lesson History (Audit Trail) ──


class LessonHistory(Base):
    __tablename__ = "lesson_histories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    client_lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_state: Mapped[LessonState | None] = mapped_column(
        Enum(LessonState, values_callable=_values_callable), nullable=True
    )
    to_state: Mapped[LessonState | None] = mapped_column(
        Enum(LessonState, values_callable=_values_callable), nullable=True
    )
    changed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    lesson: Mapped["ClientLesson"] = relationship("ClientLesson", back_populates="histories")


# ── Import Log ──


class ImportLog(Base):
    __tablename__ = "import_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    import_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, values_callable=_values_callable),
        default=ImportStatus.PENDING, nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ── Instructor Qualification ──


class InstructorQualification(Base):
    __tablename__ = "instructor_qualifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    instructor_phone: Mapped[str] = mapped_column(
        ForeignKey("users.phone", ondelete="CASCADE"), nullable=False, index=True
    )
    transmission_type: Mapped[TransmissionType] = mapped_column(
        Enum(TransmissionType, values_callable=_values_callable), nullable=False
    )
    is_certified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    certified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ── Vehicle ──


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    plate_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    transmission: Mapped[TransmissionType] = mapped_column(
        Enum(TransmissionType, values_callable=_values_callable), nullable=False
    )
    status: Mapped[VehicleStatus] = mapped_column(
        Enum(VehicleStatus, values_callable=_values_callable),
        default=VehicleStatus.AVAILABLE, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
