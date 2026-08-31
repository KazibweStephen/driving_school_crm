import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    Boolean,
    DateTime,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OperatingEntryType(str, enum.Enum):
    """What a company operating-account entry represents."""
    EQUITY = "equity"                      # owner's capital injected
    LOAN = "loan"                          # a loan received (liability, credit)
    LOAN_REPAYMENT = "loan_repayment"      # repaying a loan from profits (debit)
    PROFIT = "profit"                      # profit transferred into company
    OPERATING_EXPENSE = "operating_expense"  # a company-level expense (debit)
    BRANCH_FUNDING = "branch_funding"      # funding sent to a branch (debit)
    CLIENT_ACCOUNT_POST = "client_account_post"  # money taken from a head-office client account into operating (credit)
    ACCOUNT_REPAY = "account_repay"        # money returned from operating to a client account (debit)


class OperatingDirection(str, enum.Enum):
    CREDIT = "credit"   # money in  -> increases operating balance
    DEBIT = "debit"     # money out -> decreases operating balance


class OperatingEntry(Base):
    __tablename__ = "company_operating_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    entry_type: Mapped[OperatingEntryType] = mapped_column(
        Enum(OperatingEntryType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    direction: Mapped[OperatingDirection] = mapped_column(
        Enum(OperatingDirection, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    entry_date: Mapped[date | None] = mapped_column(nullable=True)
    # For LOAN_REPAYMENT entries, the loan (LOAN credit) entry this repays.
    loan_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("company_operating_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # For BRANCH_FUNDING entries, the BranchTransfer that moved the cash.
    transfer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("branch_transfers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # For CLIENT_ACCOUNT_POST / ACCOUNT_REPAY entries, the client account (consultation) involved.
    consultation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # For ACCOUNT_REPAY entries, the CLIENT_ACCOUNT_POST entry this reconciles back against.
    repays_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("company_operating_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_pool: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.phone"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    loan_entry: Mapped["OperatingEntry | None"] = relationship(
        "OperatingEntry",
        remote_side=[id],
        foreign_keys=[loan_entry_id],
        uselist=False,
    )
