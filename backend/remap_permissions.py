#!/usr/bin/env python3
"""One-time remap of require_permission() codes to granular action codes.

Keyed by (file, verb, normalized_path). Only touches the first
require_permission("...") inside each endpoint block.
"""
import re
import sys
from pathlib import Path

V1 = Path("app/api/v1")

MAP: dict[str, dict[tuple[str, str], str]] = {
    "consultations.py": {
        ("post", "/"): "consultations.create",
        ("post", "/full"): "consultations.create",
        ("get", "/"): "consultations.view",
        ("get", "/client-search"): "consultations.view",
        ("get", "/{consultation_id}"): "consultations.view",
        ("patch", "/{consultation_id}"): "consultations.edit",
        ("delete", "/{consultation_id}"): "consultations.delete",
        ("post", "/{consultation_id}/follow-ups"): "consultations.edit",
        ("patch", "/follow-ups/{follow_up_id}"): "consultations.edit",
        ("delete", "/follow-ups/{follow_up_id}"): "consultations.edit",
        ("post", "/bulk-delete"): "consultations.delete",
    },
    "cart.py": {
        ("post", "/api/v1/consultations/{consultation_id}/cart-items"): "consultations.edit",
        ("get", "/api/v1/consultations/{consultation_id}/cart-items"): "consultations.view",
        ("patch", "/api/v1/cart-items/{item_id}"): "consultations.edit",
        ("delete", "/api/v1/cart-items/{item_id}"): "consultations.edit",
    },
    "clients.py": {
        ("get", "/api/v1/clients/"): "consultations.view",
        ("get", "/api/v1/clients/{consultation_id}"): "consultations.view",
        ("post", "/api/v1/consultations/{consultation_id}/payments"): "payments.record",
        ("get", "/api/v1/consultations/{consultation_id}/payments"): "payments.view",
        ("patch", "/api/v1/payments/{payment_id}/installments/{installment_id}"): "payments.record",
    },
    "payments.py": {
        ("get", "/api/v1/payments/accessible-branches/"): "payments.view",
        ("get", "/api/v1/payments/"): "payments.view",
        ("get", "/api/v1/payments/report"): "reports.print",
        ("get", "/api/v1/payments/check-receipt/{receipt_number}"): "payments.view",
    },
    "receipts.py": {
        ("get", "/api/v1/receipts/{payment_id}/download"): "payments.view",
        ("get", "/api/v1/receipts/by-number/{receipt_number}"): "payments.view",
        ("get", "/api/v1/receipts/{payment_id}/link"): "payments.view",
    },
    "training.py": {
        ("get", "/{cart_item_id}/training-sessions"): "training.view",
        ("post", "/{cart_item_id}/training-sessions"): "training.create",
        ("post", "/{cart_item_id}/training-sessions/generate"): "training.generate",
        ("get", "/{cart_item_id}/training-summary"): "training.view",
        ("patch", "/training-sessions/{session_id}"): "training.edit",
        ("delete", "/training-sessions/{session_id}"): "training.delete",
        ("post", "/training-sessions/{session_id}/start"): "training.start",
        ("patch", "/training-sessions/{session_id}/timer"): "training.edit",
        ("post", "/training-sessions/{session_id}/end"): "training.edit",
        ("post", "/training-sessions/{session_id}/video/cache"): "training.edit",
        ("post", "/training-sessions/{session_id}/video/invalidate"): "training.edit",
        ("get", "/training-sessions/{session_id}/skills"): "training.view",
        ("post", "/training-sessions/{session_id}/skills"): "training.edit",
        ("patch", "/training-sessions/skills/{skill_id}"): "training.edit",
        ("delete", "/training-sessions/skills/{skill_id}"): "training.edit",
    },
    "permit.py": {
        ("get", "/{cart_item_id}/permit-progress"): "training.view",
        ("patch", "/{cart_item_id}/permit-progress"): "training.edit",
    },
    "fuel.py": {
        ("get", "/rates"): "fuel.view",
        ("get", "/rates/active"): "fuel.view",
        ("post", "/rates"): "fuel.create",
        ("patch", "/rates/{rate_id}"): "fuel.edit",
        ("delete", "/rates/{rate_id}"): "fuel.delete",
        ("get", "/refuelings"): "fuel.view",
        ("post", "/refuelings"): "fuel.create",
        ("delete", "/refuelings/{refueling_id}"): "fuel.delete",
        ("get", "/alerts"): "fuel.view",
        ("get", "/status/{vehicle_id}"): "fuel.view",
        ("get", "/report"): "fuel.view",
    },
    "lesson_plan.py": {
        ("get", "/api/v1/lesson-plan-templates"): "lesson_plans.view",
        ("post", "/api/v1/lesson-plan-templates"): "lesson_plans.create",
        ("get", "/api/v1/lesson-plan-templates/{template_id}"): "lesson_plans.view",
        ("patch", "/api/v1/lesson-plan-templates/{template_id}"): "lesson_plans.edit",
        ("delete", "/api/v1/lesson-plan-templates/{template_id}"): "lesson_plans.delete",
        ("post", "/api/v1/lesson-plan-templates/{template_id}/duplicate"): "lesson_plans.duplicate",
        ("post", "/api/v1/lesson-plan-templates/{template_id}/archive"): "lesson_plans.archive",
        ("get", "/api/v1/lesson-plan-templates/{template_id}/export"): "lesson_plans.export",
        ("post", "/api/v1/lesson-plan-templates/import"): "lesson_plans.import",
        ("post", "/api/v1/lesson-plan-templates/validate"): "lesson_plans.import",
        ("post", "/api/v1/lesson-plan-templates/{template_id}/items"): "lesson_plans.edit",
        ("patch", "/api/v1/lesson-plan-templates/items/{item_id}"): "lesson_plans.edit",
        ("delete", "/api/v1/lesson-plan-templates/items/{item_id}"): "lesson_plans.edit",
        ("get", "/api/v1/cart-items/{cart_item_id}/lesson-plans"): "lesson_plans.view",
        ("post", "/api/v1/cart-items/{cart_item_id}/lesson-plans"): "lesson_plans.create",
        ("post", "/api/v1/cart-items/{cart_item_id}/lesson-plans/generate"): "lesson_plans.create",
        ("get", "/api/v1/lesson-plans/{plan_id}"): "lesson_plans.view",
        ("patch", "/api/v1/lesson-plans/{plan_id}"): "lesson_plans.edit",
        ("delete", "/api/v1/lesson-plans/{plan_id}"): "lesson_plans.delete",
        ("post", "/api/v1/lesson-plans/{plan_id}/upgrade"): "lesson_plans.edit",
        ("patch", "/api/v1/lesson-plans/lessons/{lesson_id}"): "lesson_plans.edit",
        ("post", "/api/v1/lesson-plans/lessons/{lesson_id}/start"): "lesson_plans.edit",
        ("post", "/api/v1/lesson-plans/lessons/{lesson_id}/complete"): "lesson_plans.edit",
        ("post", "/api/v1/lesson-plans/lessons/{lesson_id}/skip"): "lesson_plans.edit",
        ("post", "/api/v1/lesson-plans/lessons/{lesson_id}/move"): "lesson_plans.edit",
        ("post", "/api/v1/lesson-plans/{plan_id}/reorder"): "lesson_plans.edit",
        ("get", "/api/v1/lesson-plans/lessons/{lesson_id}/history"): "lesson_plans.view",
    },
    "library.py": {
        ("get", "/api/v1/lesson-library"): "lesson_library.view",
        ("post", "/api/v1/lesson-library"): "lesson_library.create",
        ("get", "/api/v1/lesson-library/{lesson_id}"): "lesson_library.view",
        ("patch", "/api/v1/lesson-library/{lesson_id}"): "lesson_library.edit",
        ("delete", "/api/v1/lesson-library/{lesson_id}"): "lesson_library.delete",
        ("post", "/api/v1/lesson-library/{lesson_id}/videos/{video_id}"): "lesson_library.edit",
        ("delete", "/api/v1/lesson-library/{lesson_id}/videos/{video_id}"): "lesson_library.edit",
    },
    "video_library.py": {
        ("get", "/api/v1/video-library"): "video_library.view",
        ("post", "/api/v1/video-library"): "video_library.create",
        ("post", "/api/v1/video-library/upload"): "video_library.upload",
        ("get", "/api/v1/video-library/{video_id}"): "video_library.view",
        ("patch", "/api/v1/video-library/{video_id}"): "video_library.edit",
        ("delete", "/api/v1/video-library/{video_id}"): "video_library.delete",
        ("get", "/api/v1/video-library/{video_id}/stream"): "video_library.view",
    },
    "lesson_execution.py": {
        ("get", "/api/v1/lessons/{lesson_id}/checklists"): "lesson_execution.view",
        ("post", "/api/v1/lessons/{lesson_id}/checklists"): "lesson_execution.start",
        ("patch", "/api/v1/lessons/checklists/{item_id}"): "lesson_execution.start",
        ("delete", "/api/v1/lessons/checklists/{item_id}"): "lesson_execution.start",
        ("get", "/api/v1/lessons/{lesson_id}/competencies"): "lesson_execution.view",
        ("post", "/api/v1/lessons/{lesson_id}/competencies"): "lesson_execution.start",
        ("patch", "/api/v1/lessons/competencies/{competency_id}"): "lesson_execution.start",
        ("delete", "/api/v1/lessons/competencies/{competency_id}"): "lesson_execution.start",
        ("get", "/api/v1/lessons/{lesson_id}/timer"): "lesson_execution.view",
        ("post", "/api/v1/lessons/{lesson_id}/timer/start"): "lesson_execution.start",
        ("post", "/api/v1/lessons/{lesson_id}/timer/pause"): "lesson_execution.start",
        ("post", "/api/v1/lessons/{lesson_id}/timer/resume"): "lesson_execution.start",
        ("put", "/api/v1/lessons/{lesson_id}/timer/sync"): "lesson_execution.start",
        ("get", "/api/v1/lesson-plans/{plan_id}/theory"): "lesson_execution.view",
        ("post", "/api/v1/lesson-plans/{plan_id}/theory"): "lesson_execution.start",
        ("post", "/api/v1/lesson-plans/{plan_id}/theory/generate"): "lesson_execution.start",
        ("patch", "/api/v1/lesson-plans/theory/{session_id}"): "lesson_execution.start",
        ("get", "/api/v1/students/{consultation_id}/competency-dashboard"): "lesson_execution.view",
    },
    "competency_catalogue.py": {
        ("get", "/competency-versions"): "competency.view",
        ("post", "/competency-versions"): "competency.create",
        ("get", "/competency-versions/{version_id}"): "competency.view",
        ("patch", "/competency-versions/{version_id}"): "competency.edit",
        ("post", "/competency-versions/{version_id}/activate"): "competency.edit",
        ("delete", "/competency-versions/{version_id}"): "competency.delete",
        ("get", "/competency-categories"): "competency.view",
        ("post", "/competency-categories"): "competency.create",
        ("patch", "/competency-categories/{category_id}"): "competency.edit",
        ("delete", "/competency-categories/{category_id}"): "competency.delete",
        ("get", "/competencies"): "competency.view",
        ("post", "/competencies"): "competency.create",
        ("get", "/competencies/search"): "competency.view",
        ("get", "/competencies/{competency_id}"): "competency.view",
        ("patch", "/competencies/{competency_id}"): "competency.edit",
        ("post", "/competencies/{competency_id}/deactivate"): "competency.edit",
        ("post", "/competency-import"): "competency.import",
        ("get", "/lesson-library/{lesson_id}/competencies"): "competency.view",
        ("put", "/lesson-library/{lesson_id}/competencies"): "competency.edit",
    },
    "vehicles.py": {
        ("get", "/api/v1/vehicles"): "vehicles.view",
        ("post", "/api/v1/vehicles"): "vehicles.create",
        ("get", "/api/v1/vehicles/{vehicle_id}"): "vehicles.view",
        ("patch", "/api/v1/vehicles/{vehicle_id}"): "vehicles.edit",
        ("delete", "/api/v1/vehicles/{vehicle_id}"): "vehicles.delete",
    },
    "vehicle_assignments.py": {
        ("get", "/api/v1/vehicle-assignments"): "vehicles.view",
        ("get", "/api/v1/vehicle-assignments/{assignment_id}"): "vehicles.view",
        ("post", "/api/v1/vehicle-assignments"): "vehicles.assign_branches",
        ("post", "/api/v1/vehicle-assignments/transfer"): "vehicles.assign_branches",
        ("delete", "/api/v1/vehicle-assignments/{assignment_id}"): "vehicles.assign_branches",
    },
    "vehicle_schedule.py": {
        ("get", "/api/v1/vehicle-schedule"): "vehicle_schedule.view",
        ("get", "/api/v1/vehicle-schedule/{slot_id}"): "vehicle_schedule.view",
        ("post", "/api/v1/vehicle-schedule"): "vehicle_schedule.create",
        ("patch", "/api/v1/vehicle-schedule/{slot_id}"): "vehicle_schedule.edit",
        ("delete", "/api/v1/vehicle-schedule/{slot_id}"): "vehicle_schedule.delete",
        ("put", "/api/v1/vehicle-schedule/{vehicle_id}/bulk"): "vehicle_schedule.create",
        ("get", "/api/v1/vehicle-schedule/{vehicle_id}/resolve-instructor"): "vehicle_schedule.view",
    },
    "scheduling.py": {
        ("post", "/api/v1/availabilities"): "availabilities.create",
        ("get", "/api/v1/cart-items/{cart_item_id}/availabilities"): "availabilities.view",
        ("patch", "/api/v1/availabilities/{avail_id}"): "availabilities.edit",
        ("delete", "/api/v1/availabilities/{avail_id}"): "availabilities.delete",
        ("get", "/api/v1/instructors/{instructor_id}/schedule"): "availabilities.view",
        ("get", "/api/v1/schedule/weekly"): "availabilities.view",
        ("post", "/api/v1/lesson-plans/{plan_id}/find-and-lock"): "availabilities.edit",
        ("post", "/api/v1/lesson-plans/{plan_id}/lock-schedule"): "availabilities.edit",
        ("get", "/api/v1/instructors/{instructor_id}/find-slot"): "availabilities.view",
    },
    "instructor_qualifications.py": {
        ("post", "/api/v1/instructor-qualifications"): "instructor_qualifications.create",
        ("get", "/api/v1/instructor-qualifications"): "instructor_qualifications.view",
        ("get", "/api/v1/instructor-qualifications/{qual_id}"): "instructor_qualifications.view",
        ("patch", "/api/v1/instructor-qualifications/{qual_id}"): "instructor_qualifications.edit",
        ("delete", "/api/v1/instructor-qualifications/{qual_id}"): "instructor_qualifications.delete",
    },
    "schedule_breaks.py": {
        ("get", "/api/v1/schedule-breaks"): "schedule_breaks.manage",
        ("post", "/api/v1/schedule-breaks"): "schedule_breaks.manage",
        ("patch", "/api/v1/schedule-breaks/{break_id}"): "schedule_breaks.manage",
        ("delete", "/api/v1/schedule-breaks/{break_id}"): "schedule_breaks.manage",
    },
    "companies.py": {
        ("get", "/my-branches"): "branches.view",
        ("post", "/"): "companies.create",
        ("get", "/"): "companies.view",
        ("get", "/{company_id}"): "companies.view",
        ("patch", "/{company_id}"): "companies.edit",
        ("delete", "/{company_id}"): "companies.delete",
        ("post", "/{company_id}/branches"): "branches.create",
        ("get", "/{company_id}/branches"): "branches.view",
        ("get", "/branches/{branch_id}"): "branches.view",
        ("patch", "/branches/{branch_id}"): "branches.edit",
        ("delete", "/branches/{branch_id}"): "branches.delete",
        ("post", "/branches/{branch_id}/assign-user"): "branches.assign_users",
        ("delete", "/branch-assignments/{assignment_id}"): "branches.assign_users",
        ("post", "/branches/{branch_id}/assign-vehicle"): "branches.assign_vehicles",
        ("delete", "/branch-vehicle-assignments/{assignment_id}"): "branches.assign_vehicles",
        ("post", "/branches/{branch_id}/expenses"): "expenses.create",
        ("get", "/branches/{branch_id}/expenses"): "expenses.view",
        ("post", "/branches/{branch_id}/sales"): "sales.create",
        ("get", "/branches/{branch_id}/sales"): "sales.view",
    },
    "finance.py": {
        ("post", "/expenses/upload-receipt"): "expenses.edit",
        ("get", "/expenses"): "expenses.view",
        ("post", "/expenses"): "expenses.create",
        ("patch", "/expenses/{expense_id}"): "expenses.edit",
        ("get", "/borrowed"): "collections.view",
        ("post", "/borrowed"): "collections.create",
        ("patch", "/borrowed/{item_id}"): "collections.edit",
        ("get", "/collections"): "collections.view",
        ("post", "/collections"): "collections.create",
        ("patch", "/collections/{collection_id}"): "collections.edit",
        ("get", "/dunning"): "collections.view",
        ("post", "/dunning/send"): "collections.send_dunning",
        ("get", "/transfers"): "transfers.view",
        ("get", "/transfers/notifications"): "transfers.view",
        ("post", "/transfers"): "transfers.create",
        ("post", "/transfers/{transfer_id}/receive"): "transfers.receive",
        ("post", "/transfers/{transfer_id}/cancel"): "transfers.cancel",
        ("get", "/transfers/summary"): "transfers.view",
        ("get", "/collections/sheet"): "collections.view",
        ("get", "/summary"): "collections.view",
    },
    "commission.py": {
        ("get", "/rates"): "commissions.view",
        ("post", "/rates"): "commissions.create",
        ("patch", "/rates/{rate_id}"): "commissions.edit",
        ("delete", "/rates/{rate_id}"): "commissions.delete",
        ("get", ""): "commissions.view",
        ("get", "/{commission_id}"): "commissions.view",
        ("get", "/my-dashboard/summary"): "commissions.view",
        ("post", "/{commission_id}/contest"): "commissions.contest",
        ("get", "/contests/list"): "commissions.view",
        ("patch", "/contests/{contest_id}/resolve"): "commissions.contest",
    },
    "lead.py": {
        ("post", ""): "leads.create",
        ("get", ""): "leads.view",
        ("patch", "/{lead_id}"): "leads.update_status",
    },
    "reports.py": {
        ("get", "/dashboard"): "dashboard.view",
    },
    "bulk_onboarding.py": {
        ("post", ""): "bulk_onboarding.manage",
        ("post", "/check-receipts"): "bulk_onboarding.manage",
    },
    "sms.py": {
        ("get", "/settings/{company_id}"): "sms.view",
        ("put", "/settings/{company_id}"): "sms.send",
        ("post", "/settings/{company_id}/test"): "sms.send",
        ("get", "/templates/{company_id}"): "sms.view",
        ("get", "/templates/detail/{template_id}"): "sms.view",
        ("post", "/templates/{company_id}"): "sms.send",
        ("patch", "/templates/{template_id}"): "sms.send",
        ("delete", "/templates/{template_id}"): "sms.send",
        ("post", "/send/{company_id}"): "sms.send",
        ("post", "/send-template/{company_id}"): "sms.send",
        ("get", "/logs/{company_id}"): "sms.view",
    },
    "users.py": {
        ("post", "/"): "users.create",
        ("get", "/"): "users.view",
        ("get", "/{phone}"): "users.view",
        ("patch", "/{phone}"): "users.edit",
        ("delete", "/{phone}"): "users.delete",
        ("post", "/{phone}/approve"): "users.approve",
        ("post", "/{phone}/reset-pin"): "users.reset_pin",
    },
    "products.py": {
        ("post", "/"): "products.create",
        ("get", "/"): "products.view",
        ("get", "/{product_id}"): "products.view",
        ("patch", "/{product_id}"): "products.edit",
        ("delete", "/{product_id}"): "products.delete",
    },
    "packages.py": {
        ("post", "/with-rate"): "products.create",
        ("post", "/"): "products.create",
        ("patch", "/{package_id}"): "products.edit",
        ("delete", "/{package_id}"): "products.delete",
    },
    "permissions.py": {
        ("get", "/catalog"): "permissions.manage",
        ("get", "/matrix"): "permissions.manage",
        ("put", "/matrix/{role}"): "permissions.manage",
        ("get", "/role/{role}"): "permissions.manage",
    },
}

VERB_RE = re.compile(r"@router\.(get|post|put|patch|delete)\(")
PATH_RE = re.compile(r"[\"']([^\"']*)[\"']")
PERM_RE = re.compile(r'require_permission\("([^"]+)"\)')

changed = 0
warned = 0

for fname, file_map in MAP.items():
    path = V1 / fname
    src = path.read_text()
    lines = src.splitlines(keepends=True)
    out = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        m = VERB_RE.search(line)
        if not m:
            out.append(line)
            i += 1
            continue
        verb = m.group(1)
        # gather decorator text until balanced parens
        deco = line
        depth = line.count("(") - line.count(")")
        j = i + 1
        while j < n and depth > 0:
            deco += lines[j]
            depth += lines[j].count("(") - lines[j].count(")")
            j += 1
        pm = PATH_RE.search(deco)
        epath = pm.group(1) if pm else None
        key = (verb, epath)
        newcode = file_map.get(key)
        # scan block until next @router. for the require_permission line
        k = i
        block_end = None
        for k in range(i + 1, n):
            if VERB_RE.search(lines[k]):
                block_end = k
                break
        if block_end is None:
            block_end = n
        replaced = False
        for k in range(i + 1, block_end):
            pm2 = PERM_RE.search(lines[k])
            if pm2:
                oldcode = pm2.group(1)
                if newcode is None:
                    print(f"NO MAP {fname} {verb} {epath} (had {oldcode})")
                    warned += 1
                elif oldcode != newcode:
                    lines[k] = lines[k].replace(oldcode, newcode, 1)
                    changed += 1
                replaced = True
                break
        if newcode is not None and not replaced:
            print(f"NO PERM LINE {fname} {verb} {epath} -> {newcode}")
            warned += 1
        out.extend(lines[i:j])
        i = j
    path.write_text("".join(out))

print(f"Replaced {changed} codes, {warned} warnings")
sys.exit(1 if warned else 0)
