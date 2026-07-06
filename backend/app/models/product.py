import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EntityStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    duration_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus), default=EntityStatus.ACTIVE, nullable=False
    )
    is_extension: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True
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

    packages: Mapped[list["Package"]] = relationship(
        "Package", back_populates="product", cascade="all, delete-orphan"
    )


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    requires_driving_training: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_theory_training: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_permit_processing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    driving_training_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    theory_training_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    permit_processing_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_extension: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    extension_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus), default=EntityStatus.ACTIVE, nullable=False
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

    product: Mapped["Product"] = relationship("Product", back_populates="packages")
