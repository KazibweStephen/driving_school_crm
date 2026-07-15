# AGENTS.md — Driving School CRM Anchored Summary

**Goal:** Build a production-ready driving school CRM with **multi-company + branch hierarchy**. Each Company is a tenant with its own Products, Vehicles, Lesson Plans, Lesson Libraries, Video Libraries, **Competency Catalogue**. Each Company has multiple Branches; Consultations, Expenses, Sales, Client Availabilities are branch-scoped. Users belong to a Company (nullable for super_admin) and can be assigned to Branches via `UserBranchAssignment`. Vehicles belong to a Company and can be shared across Branches via `VehicleBranchAssignment`. Unified consultation/client lifecycle, per-product-package workflow via CartItems + installments, receipt-numbered payments, derived consultation status, multi-step creation, stage-based filtering, training/permit progress tracking per cart item, backend-stored computed payment totals, auto-generated training sessions from package durations, competence-based skills per session, **comprehensive Lesson Planning & Training Management** module — including LessonLibrary (reusable lesson templates with JSONB objectives/competencies), VideoLibrary (upload + embed streaming), Vehicle management, Instructor qualification tracking, student plan generation from templates (lesson-level state machine with 10 states, lock/unlock, difficulty), lesson execution (checklists, competencies, live GPS distance tracking, timer with 30min/3km/competencies logic), TheorySession auto-generation on Saturdays, and instructor/vehicle assignment per lesson. **Competency Catalogue** — company-scoped competency versions/categories/competencies with M2M links to LessonLibrary (replacing old JSONB competencies/prerequisite_competencies), bulk import, and seeded 106 competencies across 13 categories.

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
- All 31 Playwright tests pass (no regressions)

## Tenant Isolation Status — All Endpoints Scoped
All endpoints have been fixed with multi-company scoping. Each endpoint verifies that the user's `company_id` matches the entity chain before allowing access; `super_user` / `company_super_user` bypasses all checks.

### Company Super User Role
- `company_super_user` role operates all functions within their company (same operational access as `super_user` but scoped to own company).
- Only `super_user` can create/assign `company_super_user` role via users API.
- Created with `pending_approval` status; cannot log in until approved by `super_user` via `POST /api/v1/users/{phone}/approve`.
- `require_admin_access` dependency used for users/products/packages endpoints (allows both `SUPER_USER` and `COMPANY_SUPER_USER`).
- `require_super_user` kept for truly cross-company operations (companies CRUD, approving accounts).
- Frontend should show `company_super_user` option in role dropdown (only when current user is `super_user`), `PENDING_APPROVAL` status badge, and approve button.

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
- Frontend not yet built.

## Remaining
- Build frontend for commission rates management, lead submission, commission dashboard, contests.
- User creation API doesn't return the auto-generated initial PIN — frontend needs to call reset-pin to get a PIN, or the API should return it in the response.
- Build frontend for `company_super_user` role assignment (role dropdown, warning dialog, approve button).
- Build frontend Expense and Sale pages under branches.
- Add `appendTo="body"` to remaining `p-select` and `p-datepicker` dropdowns for mobile.

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
`d4e5f6a7b8c9` (head — competency catalogue, chains from `j2k3l4m5n6o7`)

## Known Backend Fixes Applied
- `reports.py:33,36` — `Commission.amount` → `Commission.total_amount` (dashboard 500 error)
- `cart.py:72` — `update_cart_item()` accepts `converter_id`/`recommender_id`; auto-creates commission on conversion
- `fuel.service.ts` + `commission.service.ts` — switched from `params as any` to `HttpParams` builder to avoid literal `"undefined"` strings
- `competency_catalogue.py` model — added missing `Enum` import from `sqlalchemy`

## Test Files
- `e2e/login.spec.ts` (11 tests): login, sidebar navigation through collapsed groups, user CRUD/search/PIN
- `e2e/consultations.spec.ts` (15 tests): list/search, stage filter, profile with products/payments/Add to Cart, API create+verify, products page, users page
- `e2e/lesson-plans.spec.ts` (4 tests): sidebar load, API create+verify with JSONB objectives, dialog close, UI delete
- `e2e/vehicle-scheduling.spec.ts` (1 test): full flow create template, manual/auto vehicles, instructor, product, package, consultation, client plan with manual_days=4, lock dual-phase, verify day 1–4 manual, day 5–10 auto, cleanup
