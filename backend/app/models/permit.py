import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
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
    tested_on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expecting_permit_on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    delayed_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cart_item: Mapped["CartItem"] = relationship("CartItem", back_populates="permit_progress")
