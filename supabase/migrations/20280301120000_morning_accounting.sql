-- ============================================================================
-- ZONO — Morning / Green Invoice AUTO-INVOICING (additive, non-destructive).
-- A verified GROW payment must produce EXACTLY ONE accounting document. The
-- invoice state lives on the single `payments` row (payments already has
-- UNIQUE(provider, provider_txn_id), so one verified payment = one row = at most
-- one document — the row IS the idempotency record). `invoice_status` doubles as
-- the concurrency claim: an atomic compare-and-set (…→'issuing') lets exactly one
-- worker call Morning. `organizations.morning_client_id` dedups the Morning client
-- so we never create a new client per month.
-- Reversible-safe: only ADD COLUMN IF NOT EXISTS + an index. No data rewrite.
-- ============================================================================

-- ── Accounting-document state on the verified payment ────────────────────────
alter table public.payments add column if not exists invoice_provider   text;                 -- 'morning'
alter table public.payments add column if not exists invoice_status      text
  check (invoice_status is null or invoice_status in ('pending','issuing','issued','failed'));
alter table public.payments add column if not exists invoice_doc_id      text;                 -- Morning document id
alter table public.payments add column if not exists invoice_number      text;                 -- human doc number
alter table public.payments add column if not exists invoice_type        integer;              -- Morning doc type code (e.g. 320)
alter table public.payments add column if not exists invoice_url         text;                 -- Morning-hosted PDF/URL (never fabricated)
alter table public.payments add column if not exists invoice_amount      numeric(10,2);        -- reconciled document total
alter table public.payments add column if not exists invoice_currency    text;
alter table public.payments add column if not exists invoice_attempts    smallint not null default 0;
alter table public.payments add column if not exists invoice_error       text;                 -- last error (NO secrets)
alter table public.payments add column if not exists invoice_next_retry_at timestamptz;
alter table public.payments add column if not exists invoice_issued_at   timestamptz;

-- Recovery-cron selector: verified payments whose document is still pending/failed.
create index if not exists idx_payments_invoice_retry
  on public.payments (invoice_status, invoice_next_retry_at)
  where invoice_status in ('pending','failed');

-- ── Morning client linkage (dedup: one Morning client per org) ───────────────
alter table public.organizations add column if not exists morning_client_id text;

comment on column public.payments.invoice_status is
  'null=not eligible/not yet · pending=eligible, awaiting issue · issuing=claimed (concurrency lock) · issued=one document exists · failed=retryable/terminal';
