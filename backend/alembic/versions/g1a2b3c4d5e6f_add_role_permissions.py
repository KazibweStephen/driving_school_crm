"""add role-based permissions (role_permissions table + default backfill)

Revision ID: g1a2b3c4d5e6f
Revises: f6a7b8c9d0e1
Create Date: 2026-07-31 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "g1a2b3c4d5e6f"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Default per-role matrices (mirrors backend/app/core/permissions.py at the
# time of this migration). super_user is implicit and never stored.
DEFAULT_MATRIX: dict[str, list[str]] = {
    "company_super_user": [
        "dashboard.view",
        "reports.view",
        "consultations.view", "consultations.create", "consultations.manage", "consultations.delete",
        "payments.view", "payments.record",
        "transfers.view", "transfers.manage",
        "expenses.view", "expenses.manage",
        "collections.view", "collections.manage",
        "products.view", "products.manage",
        "companies.view", "companies.manage",
        "branches.view", "branches.manage",
        "users.view", "users.manage", "users.approve",
        "vehicles.view", "vehicles.manage",
        "vehicle_schedule.view", "vehicle_schedule.manage",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.manage",
        "training.view", "training.manage",
        "fuel.view", "fuel.manage",
        "lesson_plans.view", "lesson_plans.manage",
        "lesson_library.view", "lesson_library.manage",
        "video_library.view", "video_library.manage",
        "competency.view", "competency.manage",
        "lesson_execution.view", "lesson_execution.manage",
        "instructor_qualifications.view", "instructor_qualifications.manage",
        "commissions.view", "commissions.manage",
        "leads.view", "leads.manage",
        "bulk_onboarding.manage",
        "sms.view", "sms.manage",
        "permissions.manage",
    ],
    "office_admin": [
        "dashboard.view",
        "reports.view",
        "consultations.view", "consultations.create", "consultations.manage",
        "payments.view", "payments.record",
        "transfers.view", "transfers.manage",
        "expenses.view",
        "collections.view", "collections.manage",
        "products.view",
        "companies.view", "branches.view",
        "users.view",
        "vehicles.view", "vehicles.manage",
        "vehicle_schedule.view", "vehicle_schedule.manage",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.manage",
        "training.view", "training.manage",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.manage",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.manage",
        "instructor_qualifications.view",
        "commissions.view",
        "leads.view", "leads.manage",
        "bulk_onboarding.manage",
        "sms.view",
    ],
    "branch_supervisor": [
        "dashboard.view",
        "reports.view",
        "consultations.view", "consultations.create", "consultations.manage",
        "payments.view", "payments.record",
        "transfers.view", "transfers.manage",
        "expenses.view",
        "collections.view", "collections.manage",
        "products.view",
        "companies.view", "branches.view",
        "users.view",
        "vehicles.view", "vehicles.manage",
        "vehicle_schedule.view", "vehicle_schedule.manage",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.manage",
        "training.view", "training.manage",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.manage",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.manage",
        "instructor_qualifications.view",
        "commissions.view",
        "leads.view", "leads.manage",
        "bulk_onboarding.manage",
        "sms.view",
    ],
    "manager": [
        "dashboard.view",
        "reports.view",
        "consultations.view", "consultations.create", "consultations.manage",
        "payments.view", "payments.record",
        "transfers.view", "transfers.manage",
        "expenses.view", "expenses.manage",
        "collections.view", "collections.manage",
        "products.view",
        "companies.view", "branches.view",
        "users.view", "users.manage",
        "vehicles.view", "vehicles.manage",
        "vehicle_schedule.view", "vehicle_schedule.manage",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.manage",
        "training.view", "training.manage",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.manage",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.manage",
        "instructor_qualifications.view",
        "commissions.view",
        "leads.view", "leads.manage",
        "bulk_onboarding.manage",
        "sms.view",
    ],
    "supervisor": [
        "dashboard.view",
        "reports.view",
        "consultations.view", "consultations.create", "consultations.manage",
        "payments.view", "payments.record",
        "transfers.view", "transfers.manage",
        "expenses.view", "expenses.manage",
        "collections.view", "collections.manage",
        "products.view",
        "companies.view", "branches.view",
        "users.view", "users.manage",
        "vehicles.view", "vehicles.manage",
        "vehicle_schedule.view", "vehicle_schedule.manage",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.manage",
        "training.view", "training.manage",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.manage",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.manage",
        "instructor_qualifications.view",
        "commissions.view", "commissions.manage",
        "leads.view", "leads.manage",
        "bulk_onboarding.manage",
        "sms.view",
    ],
    "reception": [
        "dashboard.view",
        "consultations.view", "consultations.create",
        "payments.view",
        "transfers.view",
        "products.view",
    ],
    "instructor": [
        "dashboard.view",
        "consultations.view", "consultations.create", "consultations.manage",
        "transfers.view",
        "fuel.manage",
        "training.manage",
        "vehicle_schedule.view",
        "availabilities.manage",
        "lesson_plans.view",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.manage",
    ],
}


# ``.view`` codes that legitimately exist in the catalog. ``.manage`` codes
# without a real ``.view`` counterpart (e.g. ``bulk_onboarding.manage``,
# ``schedule_breaks.manage``, ``permissions.manage``) never get one expanded.
_VIEW_CODES: set[str] = {
    "dashboard.view",
    "reports.view",
    "consultations.view",
    "payments.view",
    "transfers.view",
    "expenses.view",
    "collections.view",
    "products.view",
    "companies.view",
    "branches.view",
    "users.view",
    "vehicles.view",
    "vehicle_schedule.view",
    "availabilities.view",
    "training.view",
    "fuel.view",
    "lesson_plans.view",
    "lesson_library.view",
    "video_library.view",
    "competency.view",
    "lesson_execution.view",
    "instructor_qualifications.view",
    "commissions.view",
    "leads.view",
    "sms.view",
}


def _expand(codes: list[str]) -> list[str]:
    """Every code plus implied `.view` for granted `.manage` codes."""
    result = set(codes)
    for code in list(codes):
        if code.endswith(".manage"):
            view = f"{code[:-len('.manage')]}.view"
            if view in _VIEW_CODES:
                result.add(view)
    return sorted(result)


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE role_permissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            role userrole NOT NULL,
            permission VARCHAR(80) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_role_permission_company UNIQUE (company_id, role, permission)
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_role_permissions_company_id ON role_permissions (company_id)"
    )
    op.execute(
        """
        ALTER TABLE role_permissions
        ADD CONSTRAINT fk_role_permissions_company_id
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        """
    )

    # Backfill default grants for every existing company.
    bind = op.get_bind()
    companies = bind.execute(sa.text("SELECT id FROM companies")).fetchall()
    for (company_id,) in companies:
        for role, codes in DEFAULT_MATRIX.items():
            for permission in _expand(codes):
                bind.execute(
                    sa.text(
                        "INSERT INTO role_permissions (company_id, role, permission) "
                        "VALUES (:company_id, CAST(:role AS userrole), :permission)"
                    ),
                    {"company_id": company_id, "role": role, "permission": permission},
                )


def downgrade() -> None:
    op.drop_table("role_permissions")
