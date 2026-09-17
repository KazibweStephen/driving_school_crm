-- ============================================================================
-- fix_utc_dates.sql
-- ----------------------------------------------------------------------------
-- Root cause: the server clock is UTC (Etc/UTC) but the business operates in
-- Africa/Kampala (UTC+3, no DST). Business-date logic defaulted to the UTC
-- date (backend `date.today()` / `datetime.now(timezone.utc)`, and some
-- frontends via `new Date().toISOString().slice(0,10)`).
--
--   UTC 21:00 - 23:59   ==   local 00:00 - 02:59 (NEXT day)
--
-- So any transaction auto-dated during that window was stored with the
-- PREVIOUS local day. This script detects those rows (only rows whose date
-- field exactly matches the UTC date of `created_at` — i.e. the auto-default
-- fingerprint — so manually backdated records are never touched) and bumps
-- them to the correct local day.
--
-- Usage (psql inside the postgres container):
--
--   # DRY RUN  — previews exactly which rows would change (no writes)
--   docker exec -i crm-postgres psql -U crm_user -d crm_db \
--     -v ON_ERROR_STOP=1 -f fix_utc_dates.sql
--
--   # APPLY     — after reviewing the dry run, commit the fixes atomically
--   docker exec -i crm-postgres psql -U crm_user -d crm_db \
--     -v ON_ERROR_STOP=1 --single-transaction \
--     -v apply=1 -f fix_utc_dates.sql
--
-- NOTE: after applying, re-open each affected End of Day page once — the GET
-- endpoint re-verifies saved reports from the corrected payment/expense dates.
-- ============================================================================

\set business_tz 'Africa/Kampala'

-- Rows in the UTC 21:00-23:59 window used the UTC date as "today".
-- kept as a single predicate so every block below reads the same way.
-- (psql doesn't allow reusing a named fragment, so we repeat it inline.)

-- ────────────────────────────────────────────────────────────────────────────
-- 1) payments.document_date   (Date)
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE payments
   SET document_date = (created_at AT TIME ZONE 'Africa/Kampala')::date
 WHERE document_date = (created_at AT TIME ZONE 'UTC')::date
   AND document_date IS NOT NULL
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 RETURNING id, document_date, (created_at AT TIME ZONE 'Africa/Kampala')::date AS corrected;
\else
SELECT id, created_at AS utc_created, document_date AS old,
       (created_at AT TIME ZONE 'Africa/Kampala')::date AS corrected
  FROM payments
 WHERE document_date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 ORDER BY created_at;
\endif

-- ────────────────────────────────────────────────────────────────────────────
-- 2) consultations.document_date   (Date)
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE consultations
   SET document_date = (created_at AT TIME ZONE 'Africa/Kampala')::date
 WHERE document_date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
   AND document_date IS NOT NULL
 RETURNING id, document_date, (created_at AT TIME ZONE 'Africa/Kampala')::date AS corrected;
\else
SELECT id, created_at AS utc_created, document_date AS old,
       (created_at AT TIME ZONE 'Africa/Kampala')::date AS corrected
  FROM consultations
 WHERE document_date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 ORDER BY created_at;
\endif

-- ────────────────────────────────────────────────────────────────────────────
-- 3) installments.due_date / installments.paid_date   (Date)
--    (only the installment tied to "today" is caught; future/user-set dates
--     never match the created_at-UTC-date fingerprint)
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE installments
   SET due_date   = (created_at AT TIME ZONE 'Africa/Kampala')::date
 WHERE due_date   = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21;
UPDATE installments
   SET paid_date  = (created_at AT TIME ZONE 'Africa/Kampala')::date
 WHERE paid_date  = (created_at AT TIME ZONE 'UTC')::date
   AND paid_date IS NOT NULL
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21;
\else
SELECT id, created_at AS utc_created, due_date AS old_due, paid_date AS old_paid,
       (created_at AT TIME ZONE 'Africa/Kampala')::date AS corrected
  FROM installments
 WHERE ( due_date = (created_at AT TIME ZONE 'UTC')::date
         AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21 )
    OR ( paid_date = (created_at AT TIME ZONE 'UTC')::date
         AND paid_date IS NOT NULL
         AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21 )
 ORDER BY created_at;
\endif

-- ────────────────────────────────────────────────────────────────────────────
-- 4) expenses.expense_date   (timestamptz)
--    Two sources got the previous-day date:
--      a) bare date from `date.today()` stored at midnight UTC  -> re-date to
--         local midnight of the correct day
--      b) `datetime.now(timezone.utc)` stored as a real instant  -> shift +3h
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE expenses
   SET expense_date = (((created_at AT TIME ZONE 'Africa/Kampala')::date)::timestamp
                       AT TIME ZONE 'Africa/Kampala')
 WHERE EXTRACT(HOUR FROM expense_date AT TIME ZONE 'UTC') = 0
   AND (expense_date AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 RETURNING id, expense_date;
UPDATE expenses
   SET expense_date = expense_date + INTERVAL '3 hours'
 WHERE EXTRACT(HOUR FROM expense_date AT TIME ZONE 'UTC') <> 0
   AND (expense_date AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 RETURNING id, expense_date;
\else
SELECT id, created_at AS utc_created, expense_date AS old,
       CASE WHEN EXTRACT(HOUR FROM expense_date AT TIME ZONE 'UTC') = 0
            THEN (((created_at AT TIME ZONE 'Africa/Kampala')::date)::timestamp
                  AT TIME ZONE 'Africa/Kampala')
            ELSE expense_date + INTERVAL '3 hours'
       END AS corrected
  FROM expenses
 WHERE (expense_date AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 ORDER BY created_at;
\endif

-- ────────────────────────────────────────────────────────────────────────────
-- 5) collections.collected_at   (timestamptz)
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE collections
   SET collected_at = collected_at + INTERVAL '3 hours'
 WHERE collected_at IS NOT NULL
   AND (collected_at AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 RETURNING id, collected_at;
\else
SELECT id, created_at AS utc_created, collected_at AS old,
       collected_at + INTERVAL '3 hours' AS corrected
  FROM collections
 WHERE collected_at IS NOT NULL
   AND (collected_at AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 ORDER BY created_at;
\endif

-- ────────────────────────────────────────────────────────────────────────────
-- 6) sales.sale_date   (timestamptz)
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE sales
   SET sale_date = sale_date + INTERVAL '3 hours'
 WHERE (sale_date AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 RETURNING id, sale_date;
\else
SELECT id, created_at AS utc_created, sale_date AS old,
       sale_date + INTERVAL '3 hours' AS corrected
  FROM sales
 WHERE (sale_date AT TIME ZONE 'UTC')::date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 ORDER BY created_at;
\endif

-- ────────────────────────────────────────────────────────────────────────────
-- 7) company_operating_entries.entry_date   (Date, nullable)
-- ────────────────────────────────────────────────────────────────────────────
\if :{?apply}
UPDATE company_operating_entries
   SET entry_date = (created_at AT TIME ZONE 'Africa/Kampala')::date
 WHERE entry_date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 RETURNING id, entry_date;
\else
SELECT id, created_at AS utc_created, entry_date AS old,
       (created_at AT TIME ZONE 'Africa/Kampala')::date AS corrected
  FROM company_operating_entries
 WHERE entry_date = (created_at AT TIME ZONE 'UTC')::date
   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 21
 ORDER BY created_at;
\endif

-- done