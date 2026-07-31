"""Permission catalog + default per-role matrices.

Permissions are string codes granted per (company, role) via the
``role_permissions`` table. ``super_user`` bypasses every check.

Rules
-----
* Every code belongs to a named group (used by the admin UI).
* A ``.manage`` code implies its ``.view`` counterpart when granted
  (``expand_permissions``). Both are stored so backend checks are exact.
* Endpoints that only make sense as a mutation (e.g. bulk onboarding) have a
  bare ``manage`` code with no view counterpart.

The default matrices encode each role's intended capabilities. They are
seeded for every company (at creation and via the backfill migration) and can
be adjusted per company by someone holding ``permissions.manage``.
"""

from dataclasses import dataclass, field

from app.models.user import UserRole


@dataclass(frozen=True)
class PermissionGroup:
    key: str
    label: str
    codes: list[str]


PERMISSION_GROUPS: list[PermissionGroup] = [
    PermissionGroup("dashboard", "Dashboard", ["dashboard.view"]),
    PermissionGroup("reports", "Reports", ["reports.view"]),
    PermissionGroup(
        "consultations",
        "Consultations",
        ["consultations.view", "consultations.create", "consultations.manage", "consultations.delete"],
    ),
    PermissionGroup("payments", "Payments & Receipts", ["payments.view", "payments.record"]),
    PermissionGroup("transfers", "Branch Transfers", ["transfers.view", "transfers.manage"]),
    PermissionGroup("expenses", "Expenses", ["expenses.view", "expenses.manage"]),
    PermissionGroup("collections", "Collections & Dunning", ["collections.view", "collections.manage"]),
    PermissionGroup("products", "Products & Packages", ["products.view", "products.manage"]),
    PermissionGroup("companies", "Companies", ["companies.view", "companies.manage"]),
    PermissionGroup("branches", "Branches", ["branches.view", "branches.manage"]),
    PermissionGroup("users", "Users", ["users.view", "users.manage", "users.approve"]),
    PermissionGroup("vehicles", "Vehicles", ["vehicles.view", "vehicles.manage"]),
    PermissionGroup("vehicle_schedule", "Vehicle Scheduling", ["vehicle_schedule.view", "vehicle_schedule.manage"]),
    PermissionGroup("schedule_breaks", "Schedule Breaks", ["schedule_breaks.manage"]),
    PermissionGroup("availabilities", "Client Scheduling", ["availabilities.view", "availabilities.manage"]),
    PermissionGroup("training", "Training & Permit", ["training.view", "training.manage"]),
    PermissionGroup("fuel", "Fuel Tracking", ["fuel.view", "fuel.manage"]),
    PermissionGroup("lesson_plans", "Lesson Plans", ["lesson_plans.view", "lesson_plans.manage"]),
    PermissionGroup("lesson_library", "Lesson Library", ["lesson_library.view", "lesson_library.manage"]),
    PermissionGroup("video_library", "Video Library", ["video_library.view", "video_library.manage"]),
    PermissionGroup("competency", "Competency Catalogue", ["competency.view", "competency.manage"]),
    PermissionGroup(
        "lesson_execution",
        "Lesson Execution",
        ["lesson_execution.view", "lesson_execution.manage"],
    ),
    PermissionGroup(
        "instructor_qualifications",
        "Instructor Qualifications",
        ["instructor_qualifications.view", "instructor_qualifications.manage"],
    ),
    PermissionGroup("commissions", "Commissions & Contests", ["commissions.view", "commissions.manage"]),
    PermissionGroup("leads", "Leads", ["leads.view", "leads.manage"]),
    PermissionGroup("bulk_onboarding", "Bulk Onboarding", ["bulk_onboarding.manage"]),
    PermissionGroup("sms", "SMS", ["sms.view", "sms.manage"]),
    PermissionGroup("permissions", "Roles & Permissions", ["permissions.manage"]),
]

ALL_PERMISSIONS: list[str] = [code for group in PERMISSION_GROUPS for code in group.codes]
ALL_PERMISSIONS_SET: frozenset[str] = frozenset(ALL_PERMISSIONS)

# Codes granted to super_user implicitly (never stored in role_permissions).
SUPER_USER_PERMISSIONS: set[str] = set(ALL_PERMISSIONS)


def _expand(codes: list[str]) -> set[str]:
    """Return the codes plus every implied ``.view`` for granted ``.manage`` codes."""
    result = set(codes)
    view_links: dict[str, str] = {}
    for group in PERMISSION_GROUPS:
        views = [c for c in group.codes if c.endswith(".view")]
        manages = [c for c in group.codes if c.endswith(".manage")]
        for m in manages:
            base = m[: -len(".manage")]
            for v in views:
                if v == f"{base}.view":
                    view_links[m] = v
    for code in codes:
        if code in view_links:
            result.add(view_links[code])
    return result


def expand_permissions(codes: list[str]) -> list[str]:
    return sorted(_expand(codes))


# ── Default per-role matrices ────────────────────────────────────────────────
# super_user is implicit (bypasses all checks) and is therefore not listed.

_DEFAULT_MATRIX: dict[UserRole, list[str]] = {
    UserRole.COMPANY_SUPER_USER: ALL_PERMISSIONS,
    UserRole.OFFICE_ADMIN: [
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
    UserRole.BRANCH_SUPERVISOR: [
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
    UserRole.MANAGER: [
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
    UserRole.SUPERVISOR: [
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
    UserRole.RECEPTION: [
        "dashboard.view",
        "consultations.view", "consultations.create",
        "payments.view",
        "transfers.view",
        "products.view",
    ],
    UserRole.INSTRUCTOR: [
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


def default_permissions_for(role: UserRole) -> list[str]:
    """Expanded default permission codes for a role (empty for super_user)."""
    if role == UserRole.SUPER_USER:
        return []
    return expand_permissions(_DEFAULT_MATRIX.get(role, []))
