-- ============================================================================
-- P8.3 — PROVIDER-QUANTITY SYNC FOUNDATION (additive, non-destructive).
-- Converts the approved P8.2 proposal (supabase/proposals/p8-3-provider-quantity.sql)
-- into a real migration, with two additive changes vs the proposal, both required
-- by the P8.3 spec and surfaced before apply:
--   • quantity_sync_status vocabulary EXPANDED from 5 → 7 values (adds 'syncing'
--     and 'failed') to model a future provider round-trip + failure.
--   • adds nullable quantity_sync_error (SAFE category label ONLY — never a raw
--     provider body/secret) so a future FAILED state can carry a reason.
--
-- STRICT: additive only. No destructive rewrite; no subscription/payment/trial
-- status change; no Pixel/RE-MAX change; creates NO subscription rows. All new
-- columns are nullable (NULL = "unknown/never synced" — honest, never 0/faked),
-- except quantity_sync_status which defaults to 'not_synced'. subscriptions is
-- already service-role-write-only (P7.2D lockdown) so the browser can NEVER write
-- these columns; this migration adds NO new grant to anon/authenticated.
--
-- The reconcile RPC is the ONLY write path for subscription_quantity /
-- quantity_sync_status: SECURITY DEFINER, service_role-only, atomic + conditional
-- (concurrency-safe), and it DELIBERATELY never writes provider_quantity —
-- provider_quantity may change ONLY after a real, verified provider response
-- (P8.4). No successful sync is faked here.
-- ============================================================================

-- 1) Additive, nullable columns.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS subscription_quantity integer,
  ADD COLUMN IF NOT EXISTS provider_quantity     integer,
  ADD COLUMN IF NOT EXISTS quantity_synced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS quantity_sync_error   text,
  ADD COLUMN IF NOT EXISTS quantity_sync_status  text NOT NULL DEFAULT 'not_synced';

-- 2) Sync-status vocabulary (7 values; mirrors QuantitySyncStatus, lowercased).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_quantity_sync_status_chk;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_quantity_sync_status_chk
  CHECK (quantity_sync_status IN
    ('not_configured','not_synced','sync_required','syncing','synced','failed','custom_review_required'));

-- 3) Non-negativity guards (NULL allowed = unknown).
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

-- 4) Partial index for a future reconciler to find orgs owing action cheaply.
CREATE INDEX IF NOT EXISTS idx_subscriptions_sync_pending
  ON public.subscriptions (quantity_sync_status)
  WHERE quantity_sync_status IN ('sync_required','custom_review_required','failed');

-- 5) Canonical reconcile write chokepoint. Server-authoritative: SECURITY DEFINER,
--    service_role-only. Atomic + conditional (IS DISTINCT FROM) → two concurrent
--    reconcilers cannot both "win": the second update matches 0 rows → NO_ACTION,
--    no duplicate event. NEVER writes provider_quantity (real-ack only, P8.4).
--    NEVER creates a subscription row. quantity_synced_at set ONLY on 'synced'.
CREATE OR REPLACE FUNCTION public.reconcile_subscription_quantity(
  p_org uuid,
  p_quantity integer,
  p_status text,
  p_now timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed integer;
BEGIN
  IF p_status NOT IN ('not_configured','not_synced','sync_required','syncing','synced','failed','custom_review_required') THEN
    RAISE EXCEPTION 'INVALID_SYNC_STATUS: %', p_status;
  END IF;
  IF p_quantity IS NOT NULL AND p_quantity < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;
  UPDATE public.subscriptions s
     SET subscription_quantity = p_quantity,
         quantity_sync_status  = p_status,
         quantity_synced_at    = CASE WHEN p_status = 'synced' THEN p_now ELSE s.quantity_synced_at END,
         updated_at            = p_now
   WHERE s.org_id = p_org
     AND (s.subscription_quantity IS DISTINCT FROM p_quantity
          OR s.quantity_sync_status IS DISTINCT FROM p_status);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_subscription_quantity(uuid,integer,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_subscription_quantity(uuid,integer,text,timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_subscription_quantity(uuid,integer,text,timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_subscription_quantity(uuid,integer,text,timestamptz) TO service_role;

-- 6) DEFENSE-IN-DEPTH (matches the P7.2D table-authority pattern). subscriptions
--    writes are already blocked by RLS (RLS enabled; only a SELECT policy exists),
--    but the default Supabase table grants still let anon/authenticated ATTEMPT a
--    write. Revoke them so a customer PostgREST write is blocked at BOTH the grant
--    layer and RLS — the browser can NEVER set subscription_quantity /
--    provider_quantity / quantity_sync_status / quantity_synced_at. SELECT (read)
--    is retained for the org-scoped RLS read. service_role bypasses RLS/grants and
--    remains the sole writer (via the reconcile RPC and the P8.1 subscription helpers).
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
