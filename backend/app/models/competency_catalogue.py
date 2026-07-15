import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

_values_callable = lambda x: [e.value for e in x]


class CompetencyDifficulty(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class CompetencyTrainingCategory(str, enum.Enum):
    DRIVING = "driving"
    MOTORCYCLE = "motorcycle"
    TRUCK = "truck"
    BUS = "bus"
    GENERAL = "general"


class CompetencyVersionStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


# ── Competency Version ──


class CompetencyVersion(Base):
    __tablename__ = "competency_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CompetencyVersionStatus] = mapped_column(
        Enum(CompetencyVersionStatus, values_callable=_values_callable),
        default=CompetencyVersionStatus.DRAFT, nullable=False
    )
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    competencies: Mapped[list["Competency"]] = relationship(
        "Competency", back_populates="version", cascade="all, delete-orphan",
        order_by="Competency.display_order"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "version", name="uq_competency_version_company"),
    )


# ── Competency Category ──


class CompetencyCategory(Base):
    __tablename__ = "competency_categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    competencies: Mapped[list["Competency"]] = relationship(
        "Competency", back_populates="category"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_competency_category_company"),
    )


# ── Competency ──


class Competency(Base):
    __tablename__ = "competencies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("competency_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("competency_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment_criteria: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    difficulty: Mapped[CompetencyDifficulty] = mapped_column(
        Enum(CompetencyDifficulty, values_callable=_values_callable),
        default=CompetencyDifficulty.BEGINNER, nullable=False
    )
    estimated_practice_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_category: Mapped[CompetencyTrainingCategory] = mapped_column(
        Enum(CompetencyTrainingCategory, values_callable=_values_callable),
        default=CompetencyTrainingCategory.DRIVING, nullable=False
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    version: Mapped["CompetencyVersion"] = relationship("CompetencyVersion", back_populates="competencies")
    category: Mapped["CompetencyCategory"] = relationship("CompetencyCategory", back_populates="competencies")
    prerequisites: Mapped[list["Competency"]] = relationship(
        "Competency",
        secondary="competency_prerequisites",
        primaryjoin="Competency.id == competency_prerequisites.c.competency_id",
        secondaryjoin="Competency.id == competency_prerequisites.c.prerequisite_id",
        backref="required_by",
    )
    lesson_links: Mapped[list["LessonCompetencyLink"]] = relationship(
        "LessonCompetencyLink", back_populates="competency", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "version_id", "code", name="uq_competency_version_code"),
    )


# ── Competency Prerequisites ──


class CompetencyPrerequisite(Base):
    __tablename__ = "competency_prerequisites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    competency_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prerequisite_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("competency_id", "prerequisite_id", name="uq_competency_prerequisite"),
    )


# ── Lesson ↔ Competency Junction ──


class LessonCompetencyLink(Base):
    __tablename__ = "lesson_competencies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesson_library_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("lesson_library.id", ondelete="CASCADE"), nullable=False, index=True
    )
    competency_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    lesson: Mapped["LessonLibrary"] = relationship("LessonLibrary", back_populates="competency_links")
    competency: Mapped["Competency"] = relationship("Competency", back_populates="lesson_links")

    __table_args__ = (
        UniqueConstraint("lesson_library_id", "competency_id", name="uq_lesson_competency"),
    )
