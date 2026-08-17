import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


_values_callable = lambda x: [e.value for e in x]


class DiscountType(str, enum.Enum):
    FIXED = "fixed"
    PERCENTAGE = "percentage"


class DiscountStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class DiscountAppliesTo(str, enum.Enum):
    ALL = "all"
    PRODUCT = "product"
    PACKAGE = "package"


class Discount(Base):
    __tablename__ = "discounts"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_discount_company_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, values_callable=_values_callable),
        nullable=False,
    )
    discount_value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    applies_to: Mapped[DiscountAppliesTo] = mapped_column(
        Enum(DiscountAppliesTo, values_callable=_values_callable),
        default=DiscountAppliesTo.ALL,
        nullable=False,
    )
    product_ids: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    package_ids: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    status: Mapped[DiscountStatus] = mapped_column(
        Enum(DiscountStatus, values_callable=_values_callable),
        default=DiscountStatus.DRAFT,
        nullable=False,
    )
    requested_by: Mapped[str] = mapped_column(
        ForeignKey("users.phone", ondelete="SET NULL"), nullable=False, index=True
    )
    approved_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"), nullable=True, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )

    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    requested_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[requested_by]
    )
    approved_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[approved_by]
    )
    branch: Mapped["Branch | None"] = relationship("Branch", back_populates="discounts")
    company: Mapped["Company"] = relationship("Company", back_populates="discounts")
    branch_assignments: Mapped[list["DiscountBranchAssignment"]] = relationship(
        "DiscountBranchAssignment", back_populates="discount", cascade="all, delete-orphan"
    )
    cart_item_links: Mapped[list["CartItemDiscount"]] = relationship(
        "CartItemDiscount", back_populates="discount", cascade="all, delete-orphan"
    )


class CartItemDiscount(Base):
    __tablename__ = "cart_item_discounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cart_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    discount_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("discounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    applied_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    applied_by: Mapped[str] = mapped_column(
        ForeignKey("users.phone", ondelete="SET NULL"), nullable=False
    )
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    cart_item: Mapped["CartItem"] = relationship("CartItem", back_populates="discount_links")
    discount: Mapped["Discount"] = relationship("Discount", back_populates="cart_item_links")


class DiscountBranchAssignment(Base):
    __tablename__ = "discount_branch_assignments"
    __table_args__ = (
        UniqueConstraint("discount_id", "branch_id", name="uq_discount_branch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    discount_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("discounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    discount: Mapped["Discount"] = relationship("Discount", back_populates="branch_assignments")
    branch: Mapped["Branch"] = relationship("Branch")
