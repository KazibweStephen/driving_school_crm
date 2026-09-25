import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PermitProgress(Base):
    __tablename__ = "permit_progress"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cart_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    got_learners_permit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    learners_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    learners_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    learners_permit_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    test_ready: Mapped[bool] = mapped_column(Boolean, default=False, server_default="f", nullable=False)
    waiting_for_permit: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="f", nullable=False
    )
    permit_paid: Mapped[bool] = mapped_column(Boolean, default=False, server_default="f", nullable=False)
    permit_received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    tested_on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    test_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expecting_permit_on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    delayed_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    eligibility_overridden: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="f", nullable=False
    )
    eligibility_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cart_item: Mapped["CartItem"] = relationship("CartItem", back_populates="permit_progress")
    audit_logs: Mapped[list["PermitAuditLog"]] = relationship(
        "PermitAuditLog", back_populates="progress", cascade="all, delete-orphan"
    )


class PermitPromise(Base):
    """A date at which a staff member promised the client their permit would
    arrive. The most recent promise drives ``expecting_permit_on_date`` /
    ``delayed_days`` on the client's PermitProgress."""
    __tablename__ = "permit_promises"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cart_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    promised_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_phone: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cart_item: Mapped["CartItem"] = relationship("CartItem", back_populates="permit_promises")


class PermitAuditLog(Base):
    """Audit trail for permit progress changes — tracks who/what/when."""
    __tablename__ = "permit_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    progress_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("permit_progress.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cart_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_changed: Mapped[str] = mapped_column(String(80), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    changed_by_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    progress: Mapped["PermitProgress"] = relationship("PermitProgress", back_populates="audit_logs")
