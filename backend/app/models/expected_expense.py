import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExpectedExpenseItem(Base):
    """Company-scoped catalogue of expected expenses used when delivering
    packages. Each item carries a unit cost and an optional default rate
    (multiplier). Active items drive the computed expected total for new/unsold
    packages; already-spent packages keep a snapshot on their CartItems.
    """
    __tablename__ = "expected_expense_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    default_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=1, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    category: Mapped["ExpenseCategory | None"] = relationship(
        "ExpenseCategory", foreign_keys=[category_id]
    )
    package_links: Mapped[list["PackageExpenseLink"]] = relationship(
        "PackageExpenseLink",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class PackageExpenseLink(Base):
    """Links a catalogue expense item to a package with the multiplier
    (rate) to apply. Expected total for the package = sum(unit_cost * multiplier)
    over its active linked items.
    """
    __tablename__ = "package_expense_links"
    __table_args__ = (
        UniqueConstraint("package_id", "item_id", name="uq_package_expense_link"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    package_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expected_expense_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    multiplier: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    item: Mapped["ExpectedExpenseItem"] = relationship(
        "ExpectedExpenseItem", back_populates="package_links"
    )
