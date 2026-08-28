"""Permission catalog + default per-role matrices.

Permissions are string codes granted per (company, role) via the
``role_permissions`` table. ``super_user`` bypasses every check.

Rules
-----
* Every code belongs to a named group (used by the admin UI).
* A ``<group>.manage`` code is the **all-actions master**: when granted it
  expands to every other code in its group (``expand_permissions`` /
  ``_expand``). Both are stored so backend checks are exact.
* Groups whose only meaningful code is the master keep a bare ``manage`` code
  with no extra actions (e.g. ``schedule_breaks.manage``).
* Endpoints that only make sense as a mutation (e.g. bulk onboarding) have a
  bare ``manage`` code with no view counterpart.

The default matrices encode each role's intended capabilities. They are
seeded for every company (at creation and via the backfill migration) and can
be adjusted per company by someone holding ``permissions.manage``.

Legacy rows stored before this rewrite only contain ``view`` / ``manage``
codes. ``get_role_permissions`` and ``has_permission`` re-expand at runtime,
so a stored ``manage`` automatically grants every action in its group with no
data migration.
"""

from dataclasses import dataclass, field

from app.models.user import UserRole


@dataclass(frozen=True)
class PermissionGroup:
    key: str
    label: str
    codes: list[str]


PERMISSION_GROUPS: list[PermissionGroup] = [
    PermissionGroup("dashboard", "Dashboard", ["dashboard.manage", "dashboard.view"]),
    PermissionGroup("reports", "Reports", ["reports.manage", "reports.view", "reports.print"]),
    PermissionGroup(
        "consultations",
        "Consultations",
        ["consultations.manage", "consultations.view", "consultations.create", "consultations.edit", "consultations.delete"],
    ),
    PermissionGroup(
        "payments",
        "Payments & Receipts",
        ["payments.manage", "payments.view", "payments.record", "payments.delete"],
    ),
    PermissionGroup(
        "transfers",
        "Branch Transfers",
        ["transfers.manage", "transfers.view", "transfers.create", "transfers.receive", "transfers.cancel"],
    ),
    PermissionGroup(
        "expenses",
        "Expenses",
        ["expenses.manage", "expenses.view", "expenses.create", "expenses.edit", "expenses.delete", "expenses.approve", "expenses.reject", "expenses.pay"],
    ),
    PermissionGroup(
        "collections",
        "Collections & Dunning",
        ["collections.manage", "collections.view", "collections.create", "collections.edit", "collections.delete", "collections.send_dunning"],
    ),
    PermissionGroup(
        "finance",
        "Finance & P&L",
        ["finance.manage", "finance.view"],
    ),
    PermissionGroup(
        "sales",
        "Sales",
        ["sales.manage", "sales.view", "sales.create", "sales.edit", "sales.delete"],
    ),
    PermissionGroup(
        "products",
        "Products & Packages",
        ["products.manage", "products.view", "products.create", "products.edit", "products.delete"],
    ),
    PermissionGroup(
        "companies",
        "Companies",
        ["companies.manage", "companies.view", "companies.create", "companies.edit", "companies.delete"],
    ),
    PermissionGroup(
        "branches",
        "Branches",
        ["branches.manage", "branches.view", "branches.create", "branches.edit", "branches.delete", "branches.assign_users", "branches.assign_vehicles"],
    ),
    PermissionGroup(
        "users",
        "Users",
        ["users.manage", "users.view", "users.create", "users.edit", "users.delete", "users.reset_pin", "users.approve"],
    ),
    PermissionGroup(
        "vehicles",
        "Vehicles",
        ["vehicles.manage", "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.delete", "vehicles.assign_branches"],
    ),
    PermissionGroup(
        "vehicle_schedule",
        "Vehicle Scheduling",
        ["vehicle_schedule.manage", "vehicle_schedule.view", "vehicle_schedule.create", "vehicle_schedule.edit", "vehicle_schedule.delete"],
    ),
    PermissionGroup("schedule_breaks", "Schedule Breaks", ["schedule_breaks.manage"]),
    PermissionGroup(
        "availabilities",
        "Client Scheduling",
        ["availabilities.manage", "availabilities.view", "availabilities.create", "availabilities.edit", "availabilities.delete"],
    ),
    PermissionGroup(
        "training",
        "Training & Permit",
        ["training.manage", "training.view", "training.create", "training.edit", "training.delete", "training.generate", "training.start"],
    ),
    PermissionGroup(
        "fuel",
        "Fuel Tracking",
        ["fuel.manage", "fuel.view", "fuel.create", "fuel.edit", "fuel.delete"],
    ),
    PermissionGroup(
        "lesson_plans",
        "Lesson Plans",
        ["lesson_plans.manage", "lesson_plans.view", "lesson_plans.create", "lesson_plans.edit", "lesson_plans.delete", "lesson_plans.duplicate", "lesson_plans.archive", "lesson_plans.export", "lesson_plans.import"],
    ),
    PermissionGroup(
        "lesson_library",
        "Lesson Library",
        ["lesson_library.manage", "lesson_library.view", "lesson_library.create", "lesson_library.edit", "lesson_library.delete"],
    ),
    PermissionGroup(
        "video_library",
        "Video Library",
        ["video_library.manage", "video_library.view", "video_library.create", "video_library.edit", "video_library.delete", "video_library.upload"],
    ),
    PermissionGroup(
        "competency",
        "Competency Catalogue",
        ["competency.manage", "competency.view", "competency.create", "competency.edit", "competency.delete", "competency.import"],
    ),
    PermissionGroup(
        "lesson_execution",
        "Lesson Execution",
        ["lesson_execution.manage", "lesson_execution.view", "lesson_execution.start"],
    ),
    PermissionGroup(
        "instructor_qualifications",
        "Instructor Qualifications",
        ["instructor_qualifications.manage", "instructor_qualifications.view", "instructor_qualifications.create", "instructor_qualifications.edit", "instructor_qualifications.delete"],
    ),
    PermissionGroup(
        "commissions",
        "Commissions & Contests",
        ["commissions.manage", "commissions.view", "commissions.create", "commissions.edit", "commissions.delete", "commissions.contest"],
    ),
    PermissionGroup(
        "leads",
        "Leads",
        ["leads.manage", "leads.view", "leads.create", "leads.edit", "leads.delete", "leads.update_status"],
    ),
    PermissionGroup(
        "discounts",
        "Discounts",
        ["discounts.manage", "discounts.view", "discounts.create", "discounts.edit", "discounts.approve", "discounts.reject", "discounts.apply"],
    ),
    PermissionGroup("bulk_onboarding", "Bulk Onboarding", ["bulk_onboarding.manage"]),
    PermissionGroup("sms", "SMS", ["sms.manage", "sms.view", "sms.send"]),
    PermissionGroup("permissions", "Roles & Permissions", ["permissions.manage"]),
]

ALL_PERMISSIONS: list[str] = [code for group in PERMISSION_GROUPS for code in group.codes]
ALL_PERMISSIONS_SET: frozenset[str] = frozenset(ALL_PERMISSIONS)

# Codes granted to super_user implicitly (never stored in role_permissions).
SUPER_USER_PERMISSIONS: set[str] = set(ALL_PERMISSIONS)


def _expand(codes: list[str]) -> set[str]:
    """Return the codes plus every implied action for granted ``.manage`` codes."""
    result = set(codes)
    for group in PERMISSION_GROUPS:
        manages = [c for c in group.codes if c.endswith(".manage")]
        for m in manages:
            if m in result:
                result |= set(group.codes)
    return result


def expand_set(codes: set[str]) -> set[str]:
    """Expand a stored set of codes into the full effective permission set."""
    return _expand(list(codes))


def expand_permissions(codes: list[str]) -> list[str]:
    return sorted(_expand(codes))


# ── Default per-role matrices ────────────────────────────────────────────────
# super_user is implicit (bypasses all checks) and is therefore not listed.

_DEFAULT_MATRIX: dict[UserRole, list[str]] = {
    UserRole.COMPANY_SUPER_USER: ALL_PERMISSIONS,
    UserRole.OFFICE_ADMIN: [
        "dashboard.view",
        "reports.view",
        "finance.view",
        "consultations.view", "consultations.create", "consultations.edit", "consultations.delete",
        "payments.view", "payments.record",
        "transfers.view", "transfers.create", "transfers.receive", "transfers.cancel",
        "expenses.view", "expenses.create", "expenses.delete",
        "sales.view",
        "collections.view", "collections.create", "collections.edit", "collections.delete", "collections.send_dunning",
        "products.view",
        "companies.view", "branches.view",
        "users.view",
        "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.delete", "vehicles.assign_branches",
        "vehicle_schedule.view", "vehicle_schedule.create", "vehicle_schedule.edit", "vehicle_schedule.delete",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.create", "availabilities.edit", "availabilities.delete",
        "training.view", "training.create", "training.edit", "training.delete", "training.generate", "training.start",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.create", "lesson_plans.edit", "lesson_plans.delete", "lesson_plans.duplicate", "lesson_plans.archive", "lesson_plans.export", "lesson_plans.import",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.start",
        "instructor_qualifications.view",
        "commissions.view",
        "leads.view", "leads.create", "leads.edit", "leads.delete", "leads.update_status",
        "bulk_onboarding.manage",
        "sms.view", "sms.send",
        "discounts.view", "discounts.create", "discounts.edit", "discounts.apply",
    ],
    UserRole.BRANCH_SUPERVISOR: [
        "dashboard.view",
        "reports.view",
        "finance.view",
        "consultations.view", "consultations.create", "consultations.edit", "consultations.delete",
        "payments.view", "payments.record",
        "transfers.view", "transfers.create", "transfers.receive", "transfers.cancel",
        "expenses.view", "expenses.create", "expenses.delete",
        "sales.view",
        "collections.view", "collections.create", "collections.edit", "collections.delete", "collections.send_dunning",
        "products.view",
        "companies.view", "branches.view",
        "users.view",
        "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.delete", "vehicles.assign_branches",
        "vehicle_schedule.view", "vehicle_schedule.create", "vehicle_schedule.edit", "vehicle_schedule.delete",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.create", "availabilities.edit", "availabilities.delete",
        "training.view", "training.create", "training.edit", "training.delete", "training.generate", "training.start",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.create", "lesson_plans.edit", "lesson_plans.delete", "lesson_plans.duplicate", "lesson_plans.archive", "lesson_plans.export", "lesson_plans.import",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.start",
        "instructor_qualifications.view",
        "commissions.view",
        "leads.view", "leads.create", "leads.edit", "leads.delete", "leads.update_status",
        "bulk_onboarding.manage",
        "sms.view", "sms.send",
        "discounts.view", "discounts.create", "discounts.edit", "discounts.apply",
    ],
    UserRole.MANAGER: [
        "dashboard.view",
        "reports.view",
        "finance.view",
        "consultations.view", "consultations.create", "consultations.edit", "consultations.delete",
        "payments.view", "payments.record",
        "transfers.view", "transfers.create", "transfers.receive", "transfers.cancel",
        "expenses.view", "expenses.create", "expenses.edit", "expenses.delete", "expenses.approve", "expenses.reject", "expenses.pay",
        "sales.view", "sales.create", "sales.edit", "sales.delete",
        "collections.view", "collections.create", "collections.edit", "collections.delete", "collections.send_dunning",
        "products.view",
        "companies.view", "branches.view",
        "users.view", "users.create", "users.edit", "users.delete", "users.reset_pin",
        "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.delete", "vehicles.assign_branches",
        "vehicle_schedule.view", "vehicle_schedule.create", "vehicle_schedule.edit", "vehicle_schedule.delete",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.create", "availabilities.edit", "availabilities.delete",
        "training.view", "training.create", "training.edit", "training.delete", "training.generate", "training.start",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.create", "lesson_plans.edit", "lesson_plans.delete", "lesson_plans.duplicate", "lesson_plans.archive", "lesson_plans.export", "lesson_plans.import",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.start",
        "instructor_qualifications.view",
        "commissions.view",
        "leads.view", "leads.create", "leads.edit", "leads.delete", "leads.update_status",
        "bulk_onboarding.manage",
        "sms.view",
        "discounts.view", "discounts.create", "discounts.edit", "discounts.apply", "discounts.approve", "discounts.reject",
    ],
    UserRole.SUPERVISOR: [
        "dashboard.view",
        "reports.view",
        "finance.view",
        "consultations.view", "consultations.create", "consultations.edit", "consultations.delete",
        "payments.view", "payments.record",
        "transfers.view", "transfers.create", "transfers.receive", "transfers.cancel",
        "expenses.view", "expenses.create", "expenses.edit", "expenses.delete", "expenses.approve", "expenses.reject", "expenses.pay",
        "sales.view", "sales.create", "sales.edit", "sales.delete",
        "collections.view", "collections.create", "collections.edit", "collections.delete", "collections.send_dunning",
        "products.view",
        "companies.view", "branches.view",
        "users.view", "users.create", "users.edit", "users.delete", "users.reset_pin",
        "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.delete", "vehicles.assign_branches",
        "vehicle_schedule.view", "vehicle_schedule.create", "vehicle_schedule.edit", "vehicle_schedule.delete",
        "schedule_breaks.manage",
        "availabilities.view", "availabilities.create", "availabilities.edit", "availabilities.delete",
        "training.view", "training.create", "training.edit", "training.delete", "training.generate", "training.start",
        "fuel.view",
        "lesson_plans.view", "lesson_plans.create", "lesson_plans.edit", "lesson_plans.delete", "lesson_plans.duplicate", "lesson_plans.archive", "lesson_plans.export", "lesson_plans.import",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.start",
        "instructor_qualifications.view",
        "commissions.view", "commissions.create", "commissions.edit", "commissions.delete", "commissions.contest",
        "leads.view", "leads.create", "leads.edit", "leads.delete", "leads.update_status",
        "bulk_onboarding.manage",
        "sms.view",
        "discounts.view", "discounts.create", "discounts.edit", "discounts.apply", "discounts.approve", "discounts.reject",
    ],
    UserRole.RECEPTION: [
        "dashboard.view",
        "consultations.view", "consultations.create",
        "payments.view",
        "transfers.view",
        "products.view",
        "discounts.view",
    ],
    UserRole.INSTRUCTOR: [
        "dashboard.view",
        "consultations.view", "consultations.create", "consultations.edit", "consultations.delete",
        "transfers.view",
        "fuel.view", "fuel.create", "fuel.edit", "fuel.delete",
        "training.view", "training.create", "training.edit", "training.delete", "training.generate", "training.start",
        "vehicle_schedule.view",
        "availabilities.view", "availabilities.create", "availabilities.edit", "availabilities.delete",
        "lesson_plans.view",
        "lesson_library.view",
        "video_library.view",
        "competency.view",
        "lesson_execution.view", "lesson_execution.start",
        "discounts.view",
    ],
}


def default_permissions_for(role: UserRole) -> list[str]:
    """Expanded default permission codes for a role (empty for super_user)."""
    if role == UserRole.SUPER_USER:
        return []
    return expand_permissions(_DEFAULT_MATRIX.get(role, []))
