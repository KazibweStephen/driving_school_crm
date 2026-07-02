import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cart_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    theory_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    driving_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lesson_plan_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Video fields
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    video_cached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    video_invalidated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Compliance timer fields
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    timer_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timer_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cart_item: Mapped["CartItem"] = relationship("CartItem", back_populates="training_sessions")
    skills: Mapped[list["Skill"]] = relationship(
        "Skill", back_populates="training_session", cascade="all, delete-orphan", order_by="Skill.order"
    )


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    competency_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    achieved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    training_session: Mapped["TrainingSession"] = relationship("TrainingSession", back_populates="skills")
