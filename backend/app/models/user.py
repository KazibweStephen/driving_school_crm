import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    SUPER_USER = "super_user"
    BRANCH_SUPERVISOR = "branch_supervisor"
    OFFICE_ADMIN = "office_admin"
    INSTRUCTOR = "instructor"
    MANAGER = "manager"
    RECEPTION = "reception"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    BLOCKED = "blocked"
    DEACTIVATED = "deactivated"


class User(Base):
    __tablename__ = "users"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_pin: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.OFFICE_ADMIN, nullable=False
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False
    )
    is_company_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
