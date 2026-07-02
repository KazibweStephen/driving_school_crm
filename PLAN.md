# Implementation Plan: Driving School CRM

## The Model: "Senior Dev Pairing, Micro-Step Execution"

We build this like two senior devs pairing — except you write the code, I guide.

**Every phase** is broken into **micro-steps** (5–20 min each).

For each micro-step you get:

```
WHAT   → The single thing to do (one file, one concern)
CODE   → Exactly what to write (copy-ready)
WHERE  → The exact file path
WHY    → Production reason + Java → Python/TS bridge learning note
```

**The cycle:**
```
You implement (5-20 min) → I review → You fix → We move on
```

A full phase = 2-4 hours. Every phase ships deployable — production safeguards are built in during the micro-step, not deferred.

## Production Checklist (every micro-step, never deferred)

- [ ] Input validation (Pydantic strict)
- [ ] Auth + authorization on protected endpoints
- [ ] Rate limiting on auth endpoints
- [ ] Structured error responses (no stack traces)
- [ ] Alembic downgrade script
- [ ] DB-level constraints (unique, not-null, FK)
- [ ] Mobile-responsive (375px min)
- [ ] Frontend error boundaries

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Python 3.12+ / FastAPI (async) |
| Database | PostgreSQL 16 via Docker |
| ORM | SQLAlchemy 2.0 (async) + Alembic |
| Validation | Pydantic v2 |
| Frontend | Angular 18 LTS (standalone components) |
| UI Library | PrimeNG + Tailwind CSS |
| State Mgmt | Angular Signals + Services |
| Auth | JWT (phone + 4-digit PIN) |
| SMS | Adapter pattern (logging first) |
| Containerization | Docker + docker-compose |
| Testing | pytest (backend), Jest (frontend) |
| Deployment | Cloud-ready (Docker images) |
| Structure | Monorepo: `/backend` + `/frontend` |

## Architecture Decisions

- **PostgreSQL in Docker** — Dev/prod parity from day one
- **SQLAlchemy async** — Matches FastAPI async natively, better connection utilization
- **JWT with refresh tokens** — Stateless auth, refresh token for session renewal
- **Signals + Services** — Simpler than NgRx, idiomatic Angular 18, good learning bridge from Java
- **PrimeNG** — Enterprise-grade tables, dialogs, calendars without building from scratch
- **Vertical slicing** — Each phase = complete feature end-to-end (DB → API → UI)

## Project Structure

```
driving_school_crm_2/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── users.py
│   │   │   │   ├── products.py
│   │   │   │   ├── clients.py
│   │   │   │   ├── consultations.py
│   │   │   │   ├── payments.py
│   │   │   │   ├── training.py
│   │   │   │   ├── expenses.py
│   │   │   │   └── fuel.py
│   │   │   └── deps.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   ├── client.py
│   │   │   ├── consultation.py
│   │   │   ├── payment.py
│   │   │   ├── training.py
│   │   │   ├── expense.py
│   │   │   └── vehicle.py
│   │   ├── schemas/
│   │   │   ├── user.py
│   │   │   ├── auth.py
│   │   │   ├── product.py
│   │   │   ├── client.py
│   │   │   ├── consultation.py
│   │   │   └── payment.py
│   │   ├── services/
│   │   │   ├── auth.py
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   ├── client.py
│   │   │   ├── consultation.py
│   │   │   └── payment.py
│   │   ├── utils/
│   │   │   └── sms.py
│   │   └── main.py
│   ├── alembic/
│   │   ├── versions/
│   │   ├── env.py
│   │   └── alembic.ini
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_users.py
│   │   ├── test_products.py
│   │   └── test_clients.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/
│   │   │   │   ├── auth/
│   │   │   │   ├── services/
│   │   │   │   └── models/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── products/
│   │   │   │   ├── clients/
│   │   │   │   ├── consultations/
│   │   │   │   ├── payments/
│   │   │   │   ├── training/
│   │   │   │   └── expenses/
│   │   │   └── shared/
│   │   │       ├── components/
│   │   │       ├── layouts/
│   │   │       └── pipes/
│   │   ├── styles/
│   │   └── index.html
│   ├── angular.json
│   ├── tailwind.config.js
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Micro-Step Phases

### Phase 0: Project Scaffolding
**Estimated: 2 hours**
**Concept:** Python project structure, Docker Compose, FastAPI basics, Angular CLI

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 0.1 | Create monorepo directory structure | — | 2m |
| 0.2 | Write docker-compose.yml (PostgreSQL) | `docker-compose.yml` | 10m |
| 0.3 | Write backend/requirements.txt (FastAPI, SQLAlchemy, Alembic, etc.) | `backend/requirements.txt` | 5m |
| 0.4 | Write backend/.env.example | `backend/.env.example` | 5m |
| 0.5 | Write backend/app/__init__.py + core/config.py | `backend/app/core/config.py` | 10m |
| 0.6 | Write backend/app/core/database.py (async SQLAlchemy engine + session) | `backend/app/core/database.py` | 10m |
| 0.7 | Write backend/app/main.py (FastAPI app + /health endpoint) | `backend/app/main.py` | 10m |
| 0.8 | Init Angular project + install PrimeNG + Tailwind | `frontend/` | 15m |
| 0.9 | Configure Tailwind + PrimeNG in Angular | `frontend/tailwind.config.js`, `frontend/src/styles.css` | 10m |
| 0.10 | Write backend/Dockerfile | `backend/Dockerfile` | 10m |
| 0.11 | Write frontend/Dockerfile + nginx.conf | `frontend/Dockerfile`, `frontend/nginx.conf` | 10m |
| 0.12 | Update docker-compose.yml with all services | `docker-compose.yml` | 10m |
| 0.13 | Build & verify: `docker-compose up` | — | 15m |

---

### Phase 1: Auth & User Management
**Estimated: 3–4 hours**
**Concepts:** SQLAlchemy models, Alembic migrations, JWT, FastAPI dependencies, HTTP interceptors

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 1.1 | User SQLAlchemy model (phone, hashed_pin, role, status) | `backend/app/models/__init__.py`, `backend/app/models/user.py` | 15m |
| 1.2 | Alembic init + first migration | `backend/alembic/` | 10m |
| 1.3 | Pydantic schemas (UserCreate, UserRead, UserUpdate) | `backend/app/schemas/user.py` | 10m |
| 1.4 | POST /api/v1/users (admin creates user) | `backend/app/api/v1/users.py` | 15m |
| 1.5 | Password hashing + JWT utility functions | `backend/app/core/security.py` | 15m |
| 1.6 | POST /api/v1/auth/login (phone + PIN → JWT) | `backend/app/api/v1/auth.py` | 15m |
| 1.7 | Auth dependency + role guard middleware | `backend/app/api/deps.py` | 15m |
| 1.8 | Password reset flow (OTP request → SMS adapter → verify OTP → new PIN) | `backend/app/services/auth.py` | 20m |
| 1.9 | Frontend: login page component (phone → PIN → submit) | `frontend/src/app/features/auth/login/` | 20m |
| 1.10 | Frontend: auth service + HTTP interceptor + route guard | `frontend/src/app/core/auth/` | 20m |
| 1.11 | Frontend: user management page (super user CRUD table) | `frontend/src/app/features/auth/users/` | 20m |

---

### Phase 2: Products & Packages
**Estimated: 2 hours**
**Concepts:** One-to-many relationships (Product → Package), accordion UI, inline sub-lists

A **Product** is a driving school offering (e.g. "Driving & Permit Processing Class B") with a name and duration label.
Each product has **Packages** — the buyable options under that product (e.g. "5 Years Permit — 830,000 UGX").
Products use an **accordion UI**: clicking a product expands it to show its packages in a compact sub-list.

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 2.1 | Product + Package SQLAlchemy models (Product: name, duration_label, description; Package: name, price, duration_label, FK→product) | `backend/app/models/product.py` | 15m |
| 2.2 | Alembic migration (replace old products/packages tables) | `backend/alembic/versions/` | 10m |
| 2.3 | Pydantic schemas (ProductCreate/Read/Update with nested packages, PackageCreate/Read/Update) | `backend/app/schemas/product.py` | 10m |
| 2.4 | Product CRUD API + Package nested CRUD | `backend/app/api/v1/products.py`, `backend/app/api/v1/packages.py` | 20m |
| 2.5 | Frontend: product accordion list with inline package sub-rows | `frontend/src/app/features/products/` | 25m |
| 2.6 | Frontend: product create/edit dialog + package create/edit dialog | `frontend/src/app/features/products/` | 20m |

---

### Phase 3: Client Consultations
**Estimated: 3 hours**
**Concepts:** Search with ranking, state machine (consulting → converted/lost), nested profile

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 3.1 | Client + Consultation + FollowUp SQLAlchemy models | `backend/app/models/client.py`, `backend/app/models/consultation.py` | 20m |
| 3.2 | Alembic migration | `backend/alembic/versions/` | 10m |
| 3.3 | Pydantic schemas (Client, Consultation, FollowUp) | `backend/app/schemas/client.py`, `backend/app/schemas/consultation.py` | 15m |
| 3.4 | Client search API (phone/name with full-text search) | `backend/app/services/client.py`, `backend/app/api/v1/clients.py` | 20m |
| 3.5 | Consultation CRUD API | `backend/app/api/v1/consultations.py` | 20m |
| 3.6 | Frontend: client search component (phone input → dropdown) | `frontend/src/app/features/clients/` | 20m |
| 3.7 | Frontend: client profile page (details + consultations + payments) | `frontend/src/app/features/clients/` | 25m |
| 3.8 | Frontend: consultation form + follow-up management | `frontend/src/app/features/consultations/` | 20m |

---

### Phase 4: Payments & Receipts
**Estimated: 2–3 hours**
**Concepts:** Financial transactions, idempotency keys, thermal-print CSS

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 4.1 | Payment SQLAlchemy model (idempotency_key, amount, balance) | `backend/app/models/payment.py` | 15m |
| 4.2 | Alembic migration | `backend/alembic/versions/` | 10m |
| 4.3 | Payment Pydantic schemas | `backend/app/schemas/payment.py` | 10m |
| 4.4 | Payment API (record payment, compute balance, auto-update status) | `backend/app/api/v1/payments.py`, `backend/app/services/payment.py` | 25m |
| 4.5 | Receipt rendering (80mm thermal format HTML/CSS) | `backend/app/utils/receipt.py` | 15m |
| 4.6 | Frontend: payment page (select packages → enter amount → change) | `frontend/src/app/features/payments/` | 25m |
| 4.7 | Frontend: receipt display + print + SMS share | `frontend/src/app/features/payments/` | 20m |

---

### Phase 5: Employee Commissions
**Estimated: 2 hours**
**Concepts:** Computed properties, aggregation queries

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 5.1 | CommissionConfig model + migration | `backend/app/models/commission.py` | 15m |
| 5.2 | Commission calculation service (prorated by amount paid) | `backend/app/services/commission.py` | 20m |
| 5.3 | Commission API (per-employee: earned, expected, monthly) | `backend/app/api/v1/commissions.py` | 15m |
| 5.4 | Frontend: employee dashboard (targets, conversions, commissions) | `frontend/src/app/features/dashboard/` | 25m |

---

### Phase 6: Training & Scheduling
**Estimated: 2 hours**
**Concepts:** Calendar logic, conflict detection

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 6.1 | TrainingSession model + migration | `backend/app/models/training.py` | 15m |
| 6.2 | Training schedule API (assign, complete, view by week/instructor) | `backend/app/api/v1/training.py` | 20m |
| 6.3 | Duration config (global + per-product) | `backend/app/services/training.py` | 10m |
| 6.4 | Frontend: calendar view (PrimeNG Schedule/FullCalendar) | `frontend/src/app/features/training/` | 25m |

---

### Phase 7: Branch, Fuel & Expenses
**Estimated: 2–3 hours**
**Concepts:** Approval workflows, file uploads, daily aggregation

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 7.1 | Branch + Vehicle + Expense + FuelRequest models | `backend/app/models/branch.py`, `backend/app/models/vehicle.py`, `backend/app/models/expense.py` | 20m |
| 7.2 | Migrations | `backend/alembic/versions/` | 10m |
| 7.3 | Expense API (CRUD) + Daily balance API | `backend/app/api/v1/expenses.py` | 20m |
| 7.4 | Fuel request API (submit, approve, reject + mileage validation) | `backend/app/api/v1/fuel.py` | 20m |
| 7.5 | Frontend: expense + fuel forms (mobile photo upload) | `frontend/src/app/features/expenses/` | 25m |
| 7.6 | Frontend: branch dashboard (daily balance summary) | `frontend/src/app/features/dashboard/` | 20m |

---

### Phase 8: Documents, Permits & Alerts
**Estimated: 2 hours**
**Concepts:** File storage abstraction, scheduled alerts

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 8.1 | Document model + migration (file_ref, type, expiry) | `backend/app/models/document.py` | 15m |
| 8.2 | Permit tracking fields (pre-test, final test, permit received) | `backend/app/models/client.py` | 10m |
| 8.3 | Alert service (approaching expiry, payment due) | `backend/app/services/alert.py` | 20m |
| 8.4 | Frontend: document upload with expiry indicators | `frontend/src/app/features/clients/` | 25m |
| 8.5 | Frontend: client timeline (consult → permit) | `frontend/src/app/features/clients/` | 20m |

---

### Phase 9: Pre-test Exams
**Estimated: 2 hours**
**Concepts:** Quiz engine, timed sessions, auto-grading

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 9.1 | Exam + Question + ExamAttempt models + migration | `backend/app/models/exam.py` | 20m |
| 9.2 | Exam CRUD API (admin builds tests) | `backend/app/api/v1/exams.py` | 20m |
| 9.3 | Exam attempt API (submit → auto-grade → result) | `backend/app/services/exam.py` | 20m |
| 9.4 | Frontend: exam builder | `frontend/src/app/features/exams/` | 20m |
| 9.5 | Frontend: exam taker (timer, progress, submit) | `frontend/src/app/features/exams/` | 25m |

---

### Phase 10: Client Portal
**Estimated: 1.5 hours**
**Concepts:** Row-level data isolation, client UX vs backoffice UX

| # | Micro-Step | File | Est. |
|---|------------|------|------|
| 10.1 | Client-facing Angular module (separate routes, read-only) | `frontend/src/app/features/portal/` | 20m |
| 10.2 | Client lineage view (training, payments, tests, permit) | `frontend/src/app/features/portal/` | 25m |
| 10.3 | Notification preferences (SMS opt-in) | `frontend/src/app/features/portal/` | 15m |

---

## How You Learn Per Phase

| Phase | Java → Python/TS Bridge | Production Pattern |
|-------|------------------------|-------------------|
| 0 | Maven → pip/venv, Servlet container → Uvicorn | Health checks, env validation |
| 1 | Spring Security → JWT middleware, JPA → SQLAlchemy | Rate limiting, hashed secrets |
| 2 | `@OneToMany` → `relationship()` | Nested validation, DB-level FK |
| 3 | `SearchService` → full-text search | Pagination, connection pooling |
| 4 | `@Transactional` → session management | Idempotency, audit logs |
| 5 | Aggregate queries → GROUP BY | Computed columns, prorating |
| 6 | Calendar logic → conflict detection | Booking invariants |
| 7 | Approval workflow → state machine | File validation, branch isolation |
| 8 | `@Scheduled` → background tasks | Expiry monitoring, abstraction |
| 9 | Quiz engine → timed sessions | Server-authoritative timer |
| 10 | Row-level security → scoped queries | Multi-tenant isolation |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Async SQLAlchemy complexity | Med | Start sync, profile, migrate later |
| SMS vendor delays | High | Logging adapter first, swap later |
| PrimeNG mobile UX | Med | Test on real devices early |
| Angular learning curve | Low | Signals+Services mirrors Java OOP |
| File storage migration | Med | Interface abstraction, swap S3 later |
