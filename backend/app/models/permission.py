import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import UserRole


class RolePermission(Base):
    """Company-scoped grant of a single permission code to a role.

    A row's presence means the role holds ``permission`` inside ``company_id``.
    ``super_user`` is never stored here — it bypasses every check.
    """

    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("company_id", "role", "permission", name="uq_role_permission_company"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    permission: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
