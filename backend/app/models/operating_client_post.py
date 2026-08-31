import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OperatingClientPost(Base):
    """A single transfer of money from a head-office client account into the
    company operating account.

    Tracks how much of the posted amount was covered by the account's
    confirmed/expected profit (so it may stay in operating) versus how much was
    taken in excess (it must be returned to the client account via
    ACCOUNT_REPAY entries, never more than was taken from that account)."""

    __tablename__ = "operating_client_posts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("company_operating_entries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # The Expense created against the head-office client_accounts pool.
    expense_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # The account's confirmed profit at the moment of posting. Amounts posted
    # above this are "excess" and are owed back to the client account.
    confirmed_profit: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, nullable=False
    )
    excess: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    # How much of this post has been reconciled (returned) to the client account.
    reconciled: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    consultation: Mapped["Consultation"] = relationship("Consultation")
    entry: Mapped["OperatingEntry | None"] = relationship("OperatingEntry")
