import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    SUPER_USER = "super_user"
    COMPANY_SUPER_USER = "company_super_user"
    BRANCH_SUPERVISOR = "branch_supervisor"
    SUPERVISOR = "supervisor"
    OFFICE_ADMIN = "office_admin"
    INSTRUCTOR = "instructor"
    MANAGER = "manager"
    RECEPTION = "reception"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    PENDING_APPROVAL = "pending_approval"
    BLOCKED = "blocked"
    DEACTIVATED = "deactivated"


class User(Base):
    __tablename__ = "users"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False, server_default="")
    last_name: Mapped[str] = mapped_column(String(50), nullable=False, server_default="")
    hashed_pin: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x]),
        default=UserRole.OFFICE_ADMIN,
        nullable=False,
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, values_callable=lambda x: [e.value for e in x]),
        default=UserStatus.ACTIVE,
        nullable=False,
    )
    is_company_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_backdate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_phone: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    failed_login_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    pin_reset_otp: Mapped[str | None] = mapped_column(String(6), nullable=True)
    pin_reset_otp_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    created_by: Mapped["User | None"] = relationship(
        "User", remote_side="User.phone", backref="created_users"
    )
    branch_assignments: Mapped[list["UserBranchAssignment"]] = relationship(
        "UserBranchAssignment", back_populates="user", cascade="all, delete-orphan"
    )
    transfer_history: Mapped[list["UserTransferHistory"]] = relationship(
        "UserTransferHistory",
        back_populates="user",
        foreign_keys="UserTransferHistory.user_phone",
        cascade="all, delete-orphan",
    )

    @property
    def branch_ids(self) -> list[uuid.UUID]:
        return [a.branch_id for a in self.branch_assignments]


class UserTransferHistory(Base):
    __tablename__ = "user_transfer_history"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_phone: Mapped[str] = mapped_column(
        String(20), ForeignKey("users.phone", ondelete="CASCADE"), nullable=False, index=True
    )
    from_company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False
    )
    to_company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False
    )
    from_branch_ids: Mapped[list[uuid.UUID] | None] = mapped_column(JSONB, nullable=True)
    to_branch_ids: Mapped[list[uuid.UUID] | None] = mapped_column(JSONB, nullable=True)
    role_before: Mapped[str | None] = mapped_column(String(20), nullable=True)
    role_after: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    transferred_by: Mapped[str] = mapped_column(
        String(20), ForeignKey("users.phone", ondelete="SET NULL"), nullable=False
    )
    is_reversed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reversed_by: Mapped[str | None] = mapped_column(
        String(20), ForeignKey("users.phone", ondelete="SET NULL"), nullable=True
    )
    reversed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(
        "User", back_populates="transfer_history", foreign_keys=[user_phone]
    )
    from_company: Mapped["Company"] = relationship(
        "Company", foreign_keys=[from_company_id]
    )
    to_company: Mapped["Company"] = relationship(
        "Company", foreign_keys=[to_company_id]
    )
    transferred_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[transferred_by], uselist=False
    )
    reversed_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[reversed_by], uselist=False
    )
