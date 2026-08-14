-- ============================================================================
-- P8.3 MIGRATION PROPOSAL — provider-quantity synchronization state (NOT APPLIED).
-- ----------------------------------------------------------------------------
-- STATUS: PROPOSAL ONLY. This file lives under supabase/proposals/ (NOT
-- supabase/migrations/) precisely so it is NEVER auto-applied. Do NOT run it as
-- part of P8.2. It is the smallest additive change that lets `subscriptions`
-- honestly persist what was last synchronized to the payment provider, which the
-- current schema CANNOT represent. P8.2 needs nothing here — it honestly reports
-- last-synced quantity as UNAVAILABLE (NOT_SYNCED). Apply this only when P8.3
-- begins real provider synchronization, behind an explicit migration gate.
--
-- WHY ADDITIVE + NULLABLE: existing rows (and the Pixel/RE-MAX orgs, which today
-- have NO subscription row at all) must be unaffected. No column overloads an
-- existing meaning. `subscription_quantity` is the intended/committed billable
-- quantity; `provider_quantity` is what the provider currently holds;
-- `quantity_synced_at` / `quantity_sync_status` record the reconciliation.
-- ============================================================================

BEGIN;

-- 1) Additive, nullable columns. NULL = "never synced" (honest UNAVAILABLE),
--    which is exactly how the P8.2 resolver already reports it.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS subscription_quantity integer,          -- committed billable qty
  ADD COLUMN IF NOT EXISTS provider_quantity     integer,          -- last qty provider holds
  ADD COLUMN IF NOT EXISTS quantity_synced_at    timestamptz,      -- when last reconciled
  ADD COLUMN IF NOT EXISTS quantity_sync_status  text
    NOT NULL DEFAULT 'not_synced';                                 -- see CHECK below

-- 2) Constrain the sync-status vocabulary (mirrors QuantitySyncStatus, lowercased).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_quantity_sync_status_chk;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_quantity_sync_status_chk
  CHECK (quantity_sync_status IN
    ('not_configured','not_synced','sync_required','custom_review_required','synced'));

-- 3) Non-negativity guards (quantities are counts; NULL allowed = unknown).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_subscription_quantity_nonneg;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_subscription_quantity_nonneg
  CHECK (subscription_quantity IS NULL OR subscription_quantity >= 0);
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_quantity_nonneg;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_provider_quantity_nonneg
  CHECK (provider_quantity IS NULL OR provider_quantity >= 0);

-- 4) Partial index to let a future reconciler find orgs owing a sync cheaply.
CREATE INDEX IF NOT EXISTS idx_subscriptions_sync_pending
  ON public.subscriptions (quantity_sync_status)
  WHERE quantity_sync_status IN ('sync_required','custom_review_required');

-- 5) RLS / GRANTS: subscriptions is already service-role-write-only (P7.2D lockdown
--    revoked insert/update/delete from `authenticated`; SELECT policy is org-scoped
--    read). These new columns inherit that posture — NO new grant is added, so the
--    browser can never write quantity/sync state. Reads stay org-scoped. Nothing to
--    change here; this block documents the deliberate no-op.

COMMIT;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_subscriptions_sync_pending;
--   ALTER TABLE public.subscriptions
--     DROP CONSTRAINT IF EXISTS subscriptions_quantity_sync_status_chk,
--     DROP CONSTRAINT IF EXISTS subscriptions_subscription_quantity_nonneg,
--     DROP CONSTRAINT IF EXISTS subscriptions_provider_quantity_nonneg,
--     DROP COLUMN IF EXISTS quantity_sync_status,
--     DROP COLUMN IF EXISTS quantity_synced_at,
--     DROP COLUMN IF EXISTS provider_quantity,
--     DROP COLUMN IF EXISTS subscription_quantity;
-- COMMIT;
