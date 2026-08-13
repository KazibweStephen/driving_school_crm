# AGENTS.md — Driving School CRM Anchored Summary

**Goal:** Build a production-ready driving school CRM with **multi-company + branch hierarchy**. Each Company is a tenant with its own Products, Vehicles, Lesson Plans, Lesson Libraries, Video Libraries, **Competency Catalogue**. Each Company has multiple Branches; Consultations, Expenses, Sales, Client Availabilities are branch-scoped. Users belong to a Company (nullable for super_admin) and can be assigned to Branches via `UserBranchAssignment`. Vehicles belong to a Company and can be shared across Branches via `VehicleBranchAssignment`. Unified consultation/client lifecycle, per-product-package workflow via CartItems + installments, receipt-numbered payments, derived consultation status, multi-step creation, stage-based filtering, training/permit progress tracking per cart item, backend-stored computed payment totals, auto-generated training sessions from package durations, competence-based skills per session, **comprehensive Lesson Planning & Training Management** module — including LessonLibrary (reusable lesson templates with JSONB objectives/competencies), VideoLibrary (upload + embed streaming), Vehicle management, Instructor qualification tracking, student plan generation from templates (lesson-level state machine with 10 states, lock/unlock, difficulty), lesson execution (checklists, competencies, live GPS distance tracking, timer with 30min/3km/competencies logic), TheorySession auto-generation on Saturdays, and instructor/vehicle assignment per lesson. **Competency Catalogue** — company-scoped competency versions/categories/competencies with M2M links to LessonLibrary (replacing old JSONB competencies/prerequisite_competencies), bulk import, and seeded 106 competencies across 13 categories.

## Session Summary — Onboarding Receipt Buttons + Installment Field Locking + SEC Seed JSON + Mobile Dashboard Target (Complete)
- **Web Add to Cart dialog installments locked**: the only remaining editable installment UI on the web was the client-profile **Add to Cart** dialog (`client-profile.html` ~1915) — amount `p-inputNumber` now `[readonly]="true"`, due date `[minDate]="today"`. All web installment UIs are now locked (verified earlier via served bundle + Playwright).
- **Mobile installments locked**: mobile **Collect Payments** (`payments.html` collect schedule) and **Make a Sale** (`sales.html` future installments) amount inputs are now `readonly` (`bg-slate-100`) with `[minDate]="today"` on the date pickers; removed the now-unused `setScheduleAmount`/`setInstallmentAmount` methods; added a `today` getter to both components.
- **Onboarding step 4 "only Close" bug fixed**: `GET /api/v1/consultations/{id}/payments` (`get_payments_by_consultation` in `backend/app/services/payment.py`) used an INNER JOIN on `consultations.branch_id` for company-scoped users, so consultations created WITHOUT a branch (`branch_id = NULL`) returned `[]` → `receiptPaymentIds` was empty → no "Receipt N" / "View Receipt" buttons, only "Close". Same issue blocked `get_consultation_by_id` and the receipt endpoints for company users.
- **Fix (backend)**: `get_payments_by_consultation`, `get_consultation_by_id` (`services/consultation.py`), and all three receipt endpoints (`api/v1/receipts.py` `download_receipt` / `download_consolidated_receipt` / `get_receipt_link`) now use `outerjoin(Branch, ...)` with `or_(Consultation.branch_id.is_(None), Branch.company_id == company_id)` — branch-less consultations/payments are unowned and stay accessible to any authenticated user (needed for the onboarding flow). Verified via `/tmp/verify6.py` (company-switched token): create no-branch consultation+payment → 201; get consultation 200; payments count=1; receipt download 200 HTML.
- **Frontend step 4 buttons**: `clients.html` now always shows **View Client** (`pi pi-user`, new `viewClient()` in `clients.ts` → navigate to `/consultations/{id}`) plus **Close** (`pi pi-times`, `closeReceipt()` now closes + refreshes the list WITHOUT navigating). "View Receipt" (manual number → consolidated) / "Receipt N" (per-payment) buttons still shown when a payment exists.
- **"Receipt 1" button missing root cause (fixed)**: `create_full_consultation` returns `cart_items: []` in its response (reload happens in the same transaction; relationship comes back empty) even though cart items + payment exist. `completePayment()` (`clients.ts`) gated `getPaymentsByConsultation(c.id)` behind `if (c.cart_items && c.cart_items.length > 0)`, so the payments fetch never fired → `receiptPaymentIds` stayed `[]` → step 4 showed only View Client + Close. **Fix**: the payments fetch is now unconditional (payment exists regardless); verified via Playwright API log + button counts (View Client=1, Receipt 1=1, Close=1). New regression spec `frontend/e2e/onboarding-receipt.spec.ts` covers readonly installments + step-4 buttons.
- **Installment fields locked**: in ALL installment UIs (web onboarding step 3 `clients.html`; client-profile Add to Cart / Complete Sale / Make Payment / Pay All) the **Amount** `p-inputNumber` is now `[readonly]="true"` (auto-split amounts are fixed; add/remove still recomputes) and the **Due Date** `p-datepicker` has `[minDate]="today"` — dates can only be today or later.
- **Zero-balance protection**: `makePayment()` (no existing schedule branch, `client-profile.ts`) computed `total_amount: amount + this.makePaymentInstallmentTotal` — if future installments were cleared to 0 the payment's own balance became 0 despite only a partial payment. Now `total_amount: amount + this.makePaymentRemainingBalance` (= the cart-item remaining balance), so a payment's balance only hits 0 when the paid amount covers the whole balance. Complete Sale / Add to Cart already used the full price, Pay All already used `amount + remaining` — all consistent now.
- **Verified**: backend `py_compile` OK; `ng build` OK (pre-existing warnings only); backend restarted (source is volume-mounted at `/app/app`); API repro `/tmp/verify6.py` passes all scenarios.
- **SEC seed JSON + interface**: `backend/app/data/seed_products.json` is a static export of SEC2's 7 products / 19 packages (Driving Only, Pemit Only, Driving and Permit Class B, Class Extension, International License Conversion, Permit Only Class A, Defensive Driving Training). `seed_company_products_from_template()` (`backend/app/scripts/seed_company_products.py`) now loads from this JSON (no longer queries the SEC2 company at runtime) and is called on company create; it no-ops if the company already has products. New endpoint `POST /api/v1/companies/{company_id}/seed-products` (`products.manage`, super_user-only cross-company) seeds from the JSON and returns `{seeded, already_has_products}`; web **Companies** page gains a "Seed default products" action (box icon, `seedProducts()` in `companies.ts`).
- **Mobile dashboard Branch Target fix**: `get_mobile_dashboard` (`backend/app/services/dashboard.py`) already summed the user's branch `BranchMonthlyTarget` rows for the current month, but when the month had none it fell back to the flat company `monthly_sales_target` (10M for every company) → appeared static. Now it rolls forward the **most recent** month that has a target for those branches before the company/default fallback. Verified: default company office_admin now sees 45M (24M Mutaasa + 21M Main Branch) instead of 10M.
- **Test gotchas (carried over)**: PrimeNG `p-inputnumber` only parses on real `keydown` events — `page.fill()` leaves the value unregistered; use `pressSequentially`. `body.payment.receipt_number` is `undefined` (JSON drops it), not `''`. Note: `search_consultations` / `client_search` still use INNER JOIN scoping, so branch-less consultations do NOT appear in the `/consultations` list for company users (only directly accessible via View Client navigation). **Frontend deploy gotcha**: the nginx frontend container serves a Docker-image build (no volume mount) — a host `ng build` alone does NOT update the served app; run `docker compose up -d --build frontend` (p-inputnumber `[readonly]="true"` renders `attr.readonly` and blocks typing/spinners, verified in the served bundle).
- **Uncommitted** (working tree): `backend/app/services/payment.py`, `backend/app/services/consultation.py`, `backend/app/api/v1/receipts.py`, `backend/app/api/v1/companies.py`, `backend/app/services/dashboard.py`, `backend/app/scripts/seed_company_products.py`, `frontend/src/app/features/clients/clients.{ts,html}`, `frontend/src/app/features/clients/client-profile.{ts,html}`, `frontend/src/app/features/companies/companies.ts`, `frontend/src/app/core/services/company.service.ts`, `frontend/mobile/src/app/features/payments/payments.{ts,html}`, `frontend/mobile/src/app/features/sales/sales.{ts,html}`; untracked `frontend/debug8.log` (pre-existing), `frontend/e2e/onboarding-receipt.spec.ts` (new regression test), `backend/app/data/seed_products.json` (new seed template).

## Constraints & Preferences
- Lunch break 13:00-13:30 reserved in all vehicle schedules (max slots per vehicle per day = 6:00-19:00 30-min slots minus enforced breaks)
- Lunch is the **only standard break** (`is_standard=True`); always enforced on all vehicles.
- Non-standard breaks (`is_standard=False`) are **conditional**: they block scheduling for a vehicle only if that vehicle has all possible slots in that half-day (morning 6:00-13:00 or afternoon 13:30-19:00) already booked. If the vehicle has free slots in the half, the break is ignored.
- Vehicles can be assigned to one or more branches on create/edit via `branch_ids` field
- `lock_schedule` enforces only enforced breaks (ValueError) and vehicle capacity derived from available slots
- `check_preferred_times` skips only enforced break slots; when no vehicle context, falls through to all-active-breaks conservative check
- Phone + 4-digit PIN auth (no self-registration), JWT tokens, bcrypt hashing
- PostgreSQL via Docker, async SQLAlchemy + Alembic
- Angular 21 (standalone) + PrimeNG 21 + Tailwind CSS v4
- Monorepo: `/backend` + `/frontend`, Docker Compose
- Mobile-first responsive (375px minimum); `appendTo="body"` on all `p-select` and `p-datepicker`
- CartItem table drives all active workflow; `interested_products` JSON feature-frozen
- Consultation status auto-derived from cart items
- Follow-ups M2M on CartItems; type `conversion` or `payment`
- Products sorted by `created_at` descending
- Lost/converted/converted_paid/converted_paying cart items cannot be deleted or selected for follow-ups (frontend + backend guard)
- Recovery of lost items requires a reason; marking lost requires a note + creates completed follow-up
- Receipt numbers: manual entry + auto-generated system receipt as transaction ID
- Consultation creation deferred until products added (at least one with price); single-transaction endpoint `POST /api/v1/consultations/full`
- Nginx proxy timeout 120s; loading overlay on all payment/submit flows
- Pre-fill existing `interested`/`consulting` cart items in Add to Cart dialog
- `/consultations` is the only list page; stage filter replaces separate `/clients` page
- Multi-step creation (Info → Products → Payment → Receipt) + Multi-step Add to Cart (Steps 1–3)
- Complete Sale dialog + Make Payment dialog with receipt validation, installment builder
- Package training flags: `requires_driving_training`, `requires_theory_training`, `requires_permit_processing` with conditional duration fields
- CartItem training/permit fields inherited from Package at creation (denormalized, not looked up at runtime)
- Training sessions per cart item with theory/driving minutes split; summary computed against cart-item-stored duration fields
- Permit progress 1:1 with CartItem; dates stored, days-to-event computed client-side
- All enum columns use `Enum(..., values_callable=...)` for asyncpg lowercase
- Pay-now amounts on consultation creation entered manually (not auto-filled)
- Up to 2 future installments auto-suggested (split remaining balance in half, 1 week apart); user can override amounts and dates – recalculated on every allocation change
- Receipt shows per-item balance column + upcoming installment schedule
- Per-payment receipt (80mm): item-block rows (Item / Grand Total / This Pmt / Cumulative Paid / Balance Due), a "Payments Details" table (all payments for the item + pending installments, merged by date), then an "Installments" section; no redundant totals-table; barcode serial + footer bold
- Consolidated receipt: per-payment item-blocks (Balance Due) + aggregate totals-table (Grand Total / Total Paid / Balance Due) + merged installments with "Installments" section title
- Payment `total_paid` and `balance` computed backend-side and stored on the Payment record; frontend reads them directly
- `paymentInstallments` is a signal (not plain array) for reliable Angular change detection
- Lesson plan templates per transmission type (manual/automatic/both); per-client instance with `p-orderList` drag-reorder, add/remove lessons from template pool, toggle, week organization
- Each lesson is 30min or 3km whichever comes first; competence-based completion
- Clients can combine sessions (1hr or 1.5hr); each session can combine theory + practical
- Training session auto-generation: user enters start date, system creates sessions from package duration fields (`driving_training_duration_days` × 30 = total driving min, `theory_training_hours` × 60 = total theory min)
- Playwright tests use system Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, base URL `http://localhost:80`, 30s timeout, 1 retry, screenshots on failure
- Production deploy: see `DEPLOYMENT.md`; compose file `docker-compose.prod.yml`; scripts in `deploy/`; GitHub Actions workflow `.github/workflows/deploy.yml`; manual deploy on droplet with `./deploy/deploy.sh`
- Video upload limited to 500MB, allowed types: mp4, webm, mov, avi; stored in `uploads/videos/`, streamed with Range headers for seeking
- YouTube/Vimeo links stored as `source = 'youtube' | 'vimeo'` with URL; no embed sanitization needed at rest
- JSONB arrays for lesson_objectives and practical_objectives on LessonTemplateItem and ClientLesson (not text)
- Lesson plan templates can be duplicated, archived, exported/imported as JSON; imports validated before saving
- ClientLesson state machine: pending → unlocked → in_progress → completed / partially_completed / skipped / cancelled / carried_over / makeup / excused
- Active lesson days: purchased lessons only unlocked; remaining days greyed-out (`is_locked`)
- Auto-generation creates lessons for `purchased_days`; upgrade adds more days with new lessons and shifts existing
- TheorySession entity separate from ClientLesson; auto-generated on Saturdays, 2-hour duration
- Live GPS tracking via browser Geolocation API; stored in `ClientLessonTimer.distance_km`
- 30min OR 3km OR competencies achieved (whichever first) ends a lesson timer
- Frontend Lesson Library and Video Library pages registered in sidebar and routes
- Backdating feature: per-user `can_backdate` flag (admin-configurable); `document_date` on Consultation and Payment records; default `document_date` is current date; `created_at` remains system-generated audit timestamp
- JWT access token includes `can_backdate` claim; frontend `AuthService.currentUserCanBackdate()` exposes it
- Payments page under Management sidebar group: list/search, date range + client type + branch filters, totals cards, print report (privileged roles)
- Payments table: client name links to `/consultations/{id}`, received-by user shown below phone, sort icons kept on same line as headers
- Payments list filters/sorts by `document_date` (falling back to `created_at`)
- Products GET endpoints (`GET /api/v1/products/`, `GET /api/v1/products/{id}`) allow any authenticated user (read-only); create/update/delete are gated by `products.manage`; frontend Products page hides Templates/Add/Edit/Deactivate actions for users without it
- Companies GET endpoints allow any authenticated user but non-super users only see/access their own company; create/update/delete are gated by `companies.manage`; frontend Companies page hides New/Edit/Delete without it
- All v1 API endpoints are gated by fine-grained permission codes (`require_permission("...")`); `super_user` bypasses all checks; `.manage` implies its `.view` counterpart; only `users.py` (`/me`, `/change-pin`) still uses plain `get_current_user`
- JWT access token carries a `permissions` claim (stored set, DB-authoritative) used for UI gating; role_permissions is per-company, so re-login is required for changes to take effect
- Frontend: routes carry `data.permission`, gated by `permissionGuard` (`canActivateChild`); sidebar nav filtered by permission codes (groups with zero visible children are hidden); `AuthService.hasPermission()` / `hasAnyPermission()`; `HasPermissionDirective` (`*appHasPermission`) for element-level gating
- Sidebar group expansion uses an `expandedGroups` Set signal (never mutate `group.expanded` on copies — `visibleNavGroups` getter returns fresh objects each CD run, so state must live in the component)

## Progress
### Done
- Complete monorepo scaffold, Docker Compose, Angular 21 + PrimeNG 21 + Tailwind v4, FastAPI `/health`, multi-stage Dockerfiles, nginx proxy
- User model + auth (rate-limited, 5-attempt lockout, JWT, bcrypt, session refresh 160s countdown)
- User management (7 endpoints) + seed script
- Product + Package models + CRUD + accordion UI
- Consultation CRUD + deduped search + pagination + status filter, create dialog, profile with workflow + follow-ups
- CartItem model + API (`POST/GET /consultations/{id}/cart-items`, `PATCH/DELETE /cart-items/{id}`)
- Payment + Installment models + API
- Consultation status derivation (auto-derived, never downgrades from converted)
- Multi-step consultation creation + Add to Cart + Complete Sale + Make Payment dialogs
- Follow-up update and auto-close on cart item status changes
- Backend `stage` filter on `GET /api/v1/consultations/` (consulting/active/completed/lost)
- Frontend stage filter dropdown replacing separate `/clients` page
- Package model extended with training/permit flags + duration fields
- TrainingSession model, PermitProgress model, all CRUD endpoints
- Package dialog with training/permit checkboxes + conditional duration inputs
- Training Sessions + Permit Progress sections on consultation profile
- CartItem model extended with same 6 training/permit fields (denormalized from Package at creation)
- `add_cart_item()` copies Package training/permit fields to CartItem at creation
- `get_training_summary()` reads expected minutes from CartItem stored fields
- Payment model: added `total_paid` and `balance` columns (Numeric, server default 0.00)
- Payment service: `_recompute_payment_totals()`; called in `create_payment()` and `mark_installment_paid()`
- `create_full_consultation()`: recomputes payment totals after creating payment+installments
- Frontend uses `p.total_paid` and `p.balance` directly from Payment records
- `installmentBuilder()` always recalculates 2 future installments (removed stale `length === 0` guard)
- `paymentInstallments` converted from plain array to `signal`
- Template guard: `@if (pp) { ... }` around permit progress card
- TrainingSession model extended with 7 fields: `video_url`, `video_cached`, `video_invalidated`, `started_at`, `started_by`, `timer_seconds`, `timer_started_at`
- Skill model: `name`, `description`, `competency_level` (1-5), `achieved`, `order`
- Alembic migration `a1b2c3d4e5f6`: extends training_sessions + creates skills table
- Backend: auto-generate sessions, start session, update timer, cache/invalidate video, skill CRUD
- Frontend: generate sessions dialog, skills manager dialog, start-timer flow, video cache/invalidate buttons, extended session table with video/timer/skills columns
- Backend lesson plan system: `LessonPlanTemplate`, `LessonTemplateItem`, `ClientLessonPlan`, `ClientLesson` with JSONB `skills_achieved`
- Lesson plan schemas + service (`backend/app/services/lesson_plan.py`): template CRUD, client plan CRUD with create-from-template, lesson update (toggle, status, reorder), bulk reorder
- Lesson plan API router (`backend/app/api/v1/lesson_plan.py`): 19 endpoints, registered in `main.py`
- Alembic migration `b2c3d4e5f6a7`: creates 4 lesson plan tables + 3 enum types (`transmissiontype`, `lessonplanstatus`, `clientlessonstatus`)
- Dedicated Lesson Plans page (`/lesson-plans`): template CRUD with `p-orderList` drag-and-drop reorder, create/edit dialog with Add Lesson button; sidebar link between Products and Consultations
- Client lesson plan section on consultation profile: per-cart-item view with `p-orderList` drag-and-drop reorder, add/remove from template pool, status progression, lesson detail/edit dialog
- Products page "Templates" button with quick template management dialog
- Playwright tests: 4 lesson-plans tests pass (sidebar load, API create+verify, dialog Escape close, UI delete)
- **Comprehensive Lesson Planning Module design document** covering all entities, relationships, state machines, API endpoints, and frontend pages
- Backend models: VideoLibrary, LessonLibrary, LessonLibraryVideo, ClientLessonChecklist, ClientLessonCompetency, ClientLessonTimer, TheorySession, LessonHistory, ImportLog, InstructorQualification, Vehicle — all with UUID PKs, audit timestamps, appropriate FKs
- UserRole enum extended with `manager` and `reception`
- ClientLesson expanded: 10-state LessonState enum, JSONB objectives, `lesson_library_id`, `is_locked`, `difficulty`, `outcome`, `instructor_id`, `vehicle_id`
- ClientLessonPlan: `purchased_days`, `auto_generated` columns
- LessonPlanTemplate: `status`, `is_locked` columns
- All new Pydantic schemas in `schemas/lesson_plan.py`
- Backend services: `library.py` (LessonLibrary CRUD), `video.py` (VideoLibrary CRUD + upload + file management), `vehicle.py` (Vehicle CRUD)
- Backend API routers: `api/v1/library.py`, `api/v1/video_library.py`, `api/v1/vehicles.py`, `api/v1/lesson_execution.py`
- Existing `lesson_plan.py` service + router extended with duplicate/archive/export/import/validate/generate/upgrade/move/start/complete/skip/history endpoints
- Alembic migration `c3d4e5f6a7b8_comprehensive_lesson_module_v2.py`: 9 new tables, 8 enum types, ALTER COLUMN for JSONB, new columns on existing tables
- Frontend services: `lesson-library.service.ts`, `video-library.service.ts`, `vehicle.service.ts`, `lesson-execution.service.ts`
- Frontend `lesson-plan.service.ts` updated: JSONB objectives on ClientLesson, 10-state support, new locked/difficulty/outcome/instructor/vehicle fields, new API methods
- Frontend LessonLibrary page (`/lesson-library`): full CRUD with JSONB objectives/competencies arrays UI, difficulty tags, search, pagination
- Frontend VideoLibrary page (`/video-library`): upload with drag-drop area, YouTube/Vimeo embed links, preview dialog with video/iframe player, source tags
- Frontend routes and sidebar updated with `/lesson-library` and `/video-library` entries
- Payments page (`/payments`) with listing, search, date range/client type/branch filters, totals cards, print report
- Payment model: added `created_by_phone` column (FK to `users.phone`) and `created_by_user` relationship
- Payment service/API: `list_payments()` joins `User` to return `created_by_name`; all payment creation paths store `created_by_phone`
- Backdating: `User.can_backdate`, `Consultation.document_date`, `Payment.document_date` columns + schemas + services + API + frontend date pickers
- Alembic migrations `cc4d1dfb0f04` (add_created_by_phone_to_payments) and `0cedeb757155` (add_can_backdate_document_date)
- Playwright tests updated: login tests navigate collapsed sidebar groups, lesson-plans API test sends JSONB arrays, consultation search test creates its own fixture, dialog Escape test focuses dialog first
- **Competency Catalogue Module**: company-scoped `CompetencyVersion`, `CompetencyCategory`, `Competency`, `CompetencyPrerequisite`, `LessonCompetencyLink` models; 3 enums (`CompetencyDifficulty`, `CompetencyTrainingCategory`, `CompetencyVersionStatus`); full CRUD + search + bulk import API (17 endpoints); frontend 3-tab page with versions, categories, competencies (filter/pagination/bulk import/assessment criteria); reusable `competency-picker` component; lesson-library and lesson-plans pages now use `p-multiSelect` with `competency_ids` instead of free-text arrays; old JSONB `competencies`/`prerequisite_competencies` columns dropped from `lesson_library`; Alembic migration `d4e5f6a7b8c9` (chains from `j2k3l4m5n6o7`); seed data: 1 version, 13 categories, 106 competencies, 44 prerequisite links
- **Payments fixes + auto cross-branch transfers**: `payments.branch_id` FK (collecting branch) + `branch_transfers.payment_id` FK (migration `f6a7b8c9d0e1`); payments list branch filter is now OR of `Consultation.branch_id`/`Payment.branch_id` (fixes missing today/this-week rows for null-branch or cross-collected consultations); `hard_delete_consultations` skips company scoping for `super_user` (fixes bulk-delete 404 on null-branch rows); `PaymentCreate.branch_id` accepted/validated; `create_full_consultation` sets `payment.branch_id = consultation.branch_id`; `mark_installment_paid` auto-creates/updates an `INITIATED` BranchTransfer when payment branch ≠ consultation branch (accumulates `total_paid`, reason includes branch names + receipt); frontend Complete Sale / Make Payment / Pay All dialogs get a "Collecting Branch" selector (defaults to consultation branch, `appendTo="body"`); Payments page table gains a Branch column showing `branch_name`; e2e fixtures now send `branch_id`
- **Global notifications bell**: header bell (mobile + desktop header) with red badge count; `GET /api/v1/finance/transfers/notifications` returns initiated transfers for the user's accessible branches (`incoming`/`outgoing` with from/to branch names + `to_receive_count`/`to_receive_amount`; privileged roles see all company branches, others are limited to their `UserBranchAssignment` branches); dropdown panel lists transfers with Receive action (wired to `FinanceService.receiveTransfer`), "View all transfers" link to `/transfers`, polls every 60s; frontend `FinanceService.getTransferNotifications()`
- **Fine-grained RBAC (backend + frontend)**: see the `## Fine-Grained RBAC` section below — permission catalog, `role_permissions` matrix, `require_permission()` on all v1 routers, JWT `permissions` claim, route `data.permission` + `permissionGuard`, sidebar filtering, `*appHasPermission`, `/permissions` admin page, migration `g1a2b3c4d5e6f`
- **Action-level RBAC upgrade**: permission catalog expanded to 28 groups / 142 codes with `<group>.manage` as an all-actions master that expands to every code in its group (`expand_set`, runtime re-expansion in `get_role_permissions`/`has_permission` — no data migration needed, stored `.manage`/`.view` legacy rows keep working); all v1 routers remapped to granular codes (`expenses.create/approve/reject/pay`, `payments.record`, `users.reset_pin`, `transfers.receive`, `video_library.upload`, `competency.import`, etc.); new `sales` group carved from `expenses` via backfill migration `h2i3j4k5l6m7`; one-time remap helper `backend/remap_permissions.py` (MAP of file→(verb,path)→code)
- **Expense approval workflow**: `POST /api/v1/finance/expenses/{id}/approve` (+ `reject` with `{rejection_reason}`, `mark-paid`, `DELETE`); pending-only reject, approved→paid only, paid/approved undeletable (409), rejected-delete requires `expenses.manage`, creator cannot approve/reject own (403), PATCH status changes outside pending require `expenses.manage`; approve clears `rejection_reason` and notifies creator via SMS (`on_expense_approved`); frontend Expenses page has permission-gated Approve/Reject/Delete/Mark-Paid row actions + reject-reason dialog; e2e `expenses.spec.ts` covers dialog create + full workflow
- **Office Admin Mobile PWA** (`/m/`): second Angular project in `frontend/mobile` built as a PWA (`manifest.webmanifest`, icons, service worker) and served under `/m/` via nginx `alias` + exact `/m` redirect. Features: login with phone+PIN, Dashboard (daily sales, monthly sales vs target, pending collections, current-month commission earned/pending + quick actions), Make a Sale / Previous Sale (backdated), Upsell (existing client → show already-purchased products with amount/paid/balance, add new ones, only new items in payment step), Collect Payments (per-cart-item balance, installments, receipt check), Lessons (weekly schedule day chips + start/stop lesson timer + outcome), Schedule (generate client plan from template + auto-assign instructor/vehicle via find-and-lock), Send SMS (saved templates or free text), Expenses (list/filter, create with receipt upload, approve/reject/pay/delete actions). Uses separate localStorage keys `mobile_access_token`/`mobile_refresh_token`. Backend changes: added `sms.send` to `office_admin`/`branch_supervisor` defaults in `permissions.py` and backfilled via migration `k2l3m4n5o6p7` (merges `h2i3j4k5l6m7` and `k1l2m3n4o5p6`); added `Company.monthly_sales_target` column and `GET /api/v1/dashboard/mobile` endpoint via migration `m2n3o4p5q6r7`; granted `expenses.create`/`expenses.delete` to `office_admin`/`branch_supervisor` via migration `n3o4p5q6r7s8t`. Product list on the sale screen now requests `status=active&page_size=100` from `/api/v1/products/` (matching the web Add-to-Cart behaviour) instead of fetching the default first page and filtering client-side, so active products are not hidden by pagination. Payment amount inputs use plain `<input type="number">`; balance/installment schedule is recomputed only when the user taps a **Calculate schedule** button (no live typing recompute) and updates the `selectedItems` signal to keep the UI responsive. "How did you hear about us" is a `p-select` dropdown. Receipt printing fetches the authenticated HTML blob via `PaymentService.downloadReceipt()` and opens a `blob:` URL. Collect Payments now shows a success/failure result step with amount, balance message, **Print receipt**, and **Return to client** actions instead of redirecting to the client profile. Login/refresh preserves the attempted route in `localStorage` and redirects back after sign-in. Server-side mobile detection in nginx redirects `/` and `/login` to `/m/` and `/m/login` for phone User-Agents unless the `prefer_desktop=1` cookie is set; the mobile shell has a **Desktop** link that sets the cookie and loads the desktop site. Consultation touch routing: tapping a consultation in the Consultations tab (or an Active Client) now opens the sales page (`/sales?upsell=1&id=<consultationId>`) with open cart items (`interested`/`consulting`) preloaded onto the added-products list (removable, more products can be added, Paying/Consulting both available); already-purchased items show read-only under Already purchased. `SaleItem` carries `cartItemId` so `submitUpsell` reuses existing cart items (skips `addCartItem`) for both Paying and Consulting paths; `startUpsellDeepLink` awaits product loading and falls back to `getProduct(id)` for products missing from the active list. Payments `finishCollect` now converts `interested` items too (full payment → `converted_paid`, partial → `converted_paying`) so clients who pay from the consultations page appear under **Active Clients** (`list_clients` returns consultations with `converted_paid`/`converted_paying` items). Paying/Consulting are blocked when no products are added (guards in `nextToPayment`/`nextToConsulting` + `submitUpsell`). All 48 Playwright tests pass.

## Multi-Company Architecture
- **Company** (`companies`): Top-level tenant with `id`, `name`, `code` (unique), `address`, `phone`, `email`, `is_active`
- **Branch** (`branches`): Belongs to a Company (`company_id` FK); `name`, `code` (unique), `address`, `phone`, `email`, `is_active`
- **User.company_id**: nullable FK — null for super_admin, set for company-scoped users
- **User.is_company_admin**: boolean flag for company-level admin role
- **UserBranchAssignment**: M2M between users and branches with optional `role` override
- **VehicleBranchAssignment**: M2M between vehicles and branches (car sharing)
- **Expense** (`expenses`): branch-scoped (`branch_id` FK)
- **Sale** (`sales`): branch-scoped (`branch_id` FK)
- **Scoped models** (have `company_id` FK): Product, Vehicle, LessonPlanTemplate, LessonLibrary, VideoLibrary
- **Scoped models** (have `branch_id` FK): Consultation, ClientAvailability
- Default Company (`00000000-0000-0000-0000-000000000001`) and Main Branch (`00000000-0000-0000-0000-000000000002`) are seeded; all existing records backfilled to them

## Tenant Isolation Status (Done)
- Utility module `backend/app/utils/tenant.py` with `add_company_filter()`, `add_branch_company_filter()`, `add_company_filter_from_relationship()`
- JWT token includes `company_id` claim; auth passes it on login/refresh
- Users API + service: scoped by `User.company_id`; `get_user_by_phone_with_company()` added
- Products API + service: scoped by `Product.company_id`
- Vehicles API + service: scoped by `Vehicle.company_id`
- LessonPlanTemplates API + service: scoped by `LessonPlanTemplate.company_id`
- LessonLibrary API + service: scoped by `LessonLibrary.company_id`
- VideoLibrary API + service: scoped by `VideoLibrary.company_id`
- Payments API: `_resolve_branch_ids()` scoped by `Branch.company_id`; `check_receipt` verifies company
- Consultations API + service: `search_consultations`, `get_consultation_by_id`, `client_search` scoped via `Branch.company_id`
- Clients API + service (`payment.py`): `list_clients`, `get_client_detail` scoped via `Branch.company_id`
- Finance API + service: `list_expenses`, `list_borrowed`, `list_collections`, `get_dunning_list`, `get_finance_summary` — all scoped via `Branch.company_id`
- All 39 Playwright tests pass (1 flaky retry on user creation)

## Tenant Isolation Status — All Endpoints Scoped
All endpoints have been fixed with multi-company scoping. Each endpoint verifies that the user's `company_id` matches the entity chain before allowing access; `super_user` / `company_super_user` bypasses all checks.

### Company Super User Role
- `company_super_user` role operates all functions within their company (same operational access as `super_user` but scoped to own company).
- Only `super_user` can create/assign `company_super_user` role via users API.
- Created with `pending_approval` status; cannot log in until approved by `super_user` via `POST /api/v1/users/{phone}/approve`.
- All v1 endpoints now use `require_permission(...)`; `super_user` bypasses everything (permission model replaces the old `require_admin_access` / `require_super_user` dependencies, which no longer exist in routers).

## Commission System (Complete — backend)
- **CommissionRate** per Package: 3-way split (`converter_pct`, `primary_recommender_pct`, `secondary_recommender_pct` must sum to 100). Lifecycle dates: `active_from` (required), `active_until` (nullable), `deactivated_at` (nullable — soft deactivates).
- **Commission** linked to `CartItem` (created on conversion). Stores denormalized amounts per role. Status: `pending` / `approved` / `paid` / `cancelled`.
- **Commission maturity** computed on read: `total_paid_for_cart_item / package_price * 100`.
- **CommissionContest**: dispute resolution with `reason`, `resolution`, resolved by `SUPERVISOR` role.
- **Lead model**: any user can submit leads (client_name, client_phone, location, interested_product). Statuses: `new` → `contacted` → `converted` / `lost`. Admin notes field. Converted leads link to consultation.
- **SUPERVISOR** role added (resolves contests).
- Auto-commission creation hook: `update_cart_item()` in `cart.py` calls `create_commission_from_conversion()` when a cart item transitions to `converted`/`converted_paid`/`converted_paying`.
- Migration `b219a06bb6d7` drops old `commission_rates`/`commissions` columns; adds new schema.
- Commission rates CRUD at `/api/v1/commission/commission-rates`.
- Commissions list/detail at `/api/v1/commission/commissions`.
- Dashboard summary at `/api/v1/commission/my-dashboard/summary`.
- Leads CRUD at `/api/v1/leads`.
- Contests CRUD at `/api/v1/commission/contests`.
- Backend `PackageRead` now includes the active `commission_rate` inline (selected from `commission_rates`), so the Products page can display and pre-fill without a separate fetch.
- Frontend Products page shows the active commission rate (amount + split) inline on each package row/card and pre-fills the Edit Package stepper from that inline data.
- Frontend commissions management page (`/commissions`), lead submission, commission dashboard, and contests still pending.

## Fine-Grained RBAC (Complete — backend + frontend)
- **Permission catalog** in `backend/app/core/permissions.py`: 28 groups, 142 codes, `<group>.manage` (all-actions master) + per-action codes like `<group>.create/edit/delete/approve/reject/pay` (bare-`manage` groups: `bulk_onboarding`, `schedule_breaks`, `permissions`). `expand_permissions()`/`expand_set()` expand a granted `.manage` to every code in its group (including itself, so stored and effective sets stay aligned); the implied-code expansion replaces the old `.view`-only implication.
- **Runtime re-expansion (no data migration)**: `get_role_permissions()` and `has_permission()` load the stored row set and apply `expand_set()`, so legacy `.manage`/`.view` rows automatically cover all new action codes.
- **`role_permissions` table** (`company_id` + `role` + `permission`): per-company matrix; `super_user` never stored (implicit bypass). Seeded via `seed_default_permissions()` on company create from `_DEFAULT_MATRIX` (company_super_user = all, office_admin/branch_supervisor/manager/supervisor/instructor/reception per defaults). Backfill migration `h2i3j4k5l6m7` grants `sales.view` to any role with `expenses.view` and `sales.create/edit/delete` to any role with `expenses.manage`.
- **`require_permission(code)`** in `app/api/deps.py`: reads DB-authoritative `role_permissions` (cached per request via `request.state`), returns 403 `Permission denied: {code}`. Every v1 router is wired with per-function action codes; `users.py` `/me` + `/change-pin` remain plain `get_current_user`.
- **Permissions admin API** (`/api/v1/permissions`): `GET /catalog`, `GET /matrix?company_id=`, `GET /role/{role}?company_id=`, `PUT /matrix/{role}?company_id=` body `{"permissions":[...]}` — all gated `permissions.manage`; company_super_user restricted to own company (404 otherwise).
- **JWT claim**: login/refresh embed `permissions` (sorted stored codes, super_user = full catalog). Frontend decodes into `AuthService.permissions` signal.
- **Frontend gating**: `permissionGuard` on `canActivateChild` (redirects to `/dashboard`); `data.permission` on every route; sidebar `visibleTopItems`/`visibleNavGroups` filter by codes; `*appHasPermission` structural directive (Expenses page uses action codes; other features keep `.manage` masters which still expand to all actions). Sidebar group expansion state lives in `expandedGroups` Set signal.
- **Admin page** `/permissions` (nav: Management → Permissions): company selector (super_user), role selector, per-group "All actions" master checkbox (grants the `.manage` code) + granular action checkboxes (unchecking one action while All is on converts to an explicit subset), Save (PUT). Users must re-login for changes to apply.
- Ad-hoc role checks replaced: clients bulk-delete→`consultations.delete`, payments print→`reports.view`, products admin→`products.manage`, companies edit→`companies.manage`, transfers receive/cancel→`transfers.manage`, competency writes→`competency.manage`. Super_user-only cross-company selectors (company-settings, users role option, competency/companies/permissions company pickers) and payments `canViewAllBranches` keep role checks (no permission equivalent).

## Remaining
- Build frontend commissions management page (`/commissions`), lead submission, commission dashboard, and contests.
- User creation API doesn't return the auto-generated initial PIN — frontend needs to call reset-pin to get a PIN, or the API should return it in the response.
- Build frontend Sale page under branches (Expense page is done).
- Add `appendTo="body"` to remaining `p-select` and `p-datepicker` dropdowns for mobile.
- Investigate the Playwright worker process cleanup warning that occasionally appears after the full suite run.
- Add a native mobile Expense entry screen (current quick action opens the web app at `/expenses`).

## Test Credentials
Super Admin `0782832711`, pin=`1234`

## Docker
Postgres `:5433` (external), backend `:8000`, frontend `:80`

## Backend Restart
`docker compose restart backend`

## Alembic
`docker compose exec backend bash -c 'PYTHONPATH=/app alembic upgrade head'`
If migration files are missing from container: `docker cp backend/alembic/versions/<file> crm-backend:/app/alembic/versions/`

## Migration Heads
- `o4p5q6r7s8t9u` (head — aligns DB `commissionstatus` enum with `CommissionStatus` model values, chains from `n3o4p5q6r7s8t`)
- `n3o4p5q6r7s8t` — grants `expenses.create`/`expenses.delete` to `office_admin`/`branch_supervisor` role_permissions
- `m2n3o4p5q6r7` — adds `monthly_sales_target` to `companies`

## Known Backend Fixes Applied
- `reports.py:33,36` — `Commission.amount` → `Commission.total_amount` (dashboard 500 error)
- `cart.py:72` — `update_cart_item()` accepts `converter_id`/`recommender_id`; auto-creates commission on conversion
- `fuel.service.ts` + `commission.service.ts` — switched from `params as any` to `HttpParams` builder to avoid literal `"undefined"` strings
- `competency_catalogue.py` model — added missing `Enum` import from `sqlalchemy`
- Alembic pitfall: `op.create_table` with an unbound `sa.Enum` fires `CREATE TYPE` regardless of `create_type=False`; migration `g1a2b3c4d5e6f` uses raw SQL + `CAST(:role AS userrole)` inserts; when editing a migration on the host you must `docker cp` it into `crm-backend:/app/alembic/versions/` before `alembic upgrade head`
- Mobile nginx subfolder: use `location ^~ /m/ { alias /usr/share/nginx/html/mobile/; try_files $uri $uri/ /m/index.html; }` and `location = /m { return 301 /m/; }` so that `/main-*.js` files in the web app are not caught by the `/m` prefix redirect.
- Mobile dashboard (`/api/v1/dashboard/mobile`): fixed company scoping by joining `Payment.branch_id → Branch.company_id`; changed permission gate to `dashboard.view`; aligned commission earned/pending queries with `CommissionStatus` values (`fully_matured` / `pending`/`partially_matured`).
- DB `commissionstatus` enum: migration `o4p5q6r7s8t9u` renames `paid` → `fully_matured` and adds `partially_matured` to match the model.

## Test Files
- `e2e/login.spec.ts` (11 tests): login, sidebar navigation through collapsed groups, user CRUD/search/PIN
- `e2e/consultations.spec.ts` (15 tests): list/search, stage filter, profile with products/payments/Add to Cart, API create+verify, products page, users page
- `e2e/lesson-plans.spec.ts` (4 tests): sidebar load, API create+verify with JSONB objectives, dialog close, UI delete
- `e2e/permissions.spec.ts` (2 tests): page loads with catalog groups + matrix, role matrix edit/save via API verify + restore
- `e2e/expenses.spec.ts` (2 tests): dialog create + pending row, full approve/reject/pay workflow enforced (self-approve 403, manager approve, mark-paid, delete-paid 409, reject + delete-rejected)
- `e2e/vehicle-scheduling.spec.ts` (1 test): full flow create template, manual/auto vehicles, instructor, product, package, consultation, client plan with manual_days=4, lock dual-phase, verify day 1–4 manual, day 5–10 auto, cleanup
- `e2e/mobile.spec.ts` (5 tests): mobile PWA login, dashboard, bottom nav tabs, expenses create, invalid PIN error
- `e2e/mobile-consultations.spec.ts` (7 tests): sales home tabs/buttons, consultation detail remove, consultation touch → sales upsell with preloaded products (removable + empty-block), client pays from consultations → appears under Active Clients, existing-phone dialogs, recommender preselect
