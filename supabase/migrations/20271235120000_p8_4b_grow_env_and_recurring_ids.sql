-- ============================================================================
-- P8.4B — SANDBOX/PRODUCTION ISOLATION + RECURRING IDENTIFIERS (additive).
-- ----------------------------------------------------------------------------
-- Two purposes, both additive/non-destructive:
--
-- 1) TRANSACTION ISOLATION (the reason this is applied now, not postponed):
--    payments.environment + subscriptions.provider_env record whether a
--    transaction/subscription was created under Grow SANDBOX or PRODUCTION.
--    VERIFIED REVENUE counts ONLY environment='production' — so a sandbox test
--    payment can NEVER be counted as real revenue. The app stamps the value from
--    GROW_ENV at creation; the column default is the SAFE one ('sandbox') so any
--    unstamped/edge row is EXCLUDED from revenue rather than fabricating it.
--
-- 2) RECURRING MANAGEMENT: grow_transaction_id / grow_transaction_token /
--    grow_asmachta are returned in the verified callback and are required by
--    Grow's updateDirectDebit to change the recurring amount (next-cycle, per
--    Decision A) or cancel it (changeStatus=2). Storing them unblocks the
--    provider-independent update/cancel LOGIC (the live call still needs creds).
--
-- STRICT: additive, nullable except the safe-defaulted environment. No
-- destructive rewrite; no status/trial change; no Pixel/RE-MAX change; creates
-- NO rows. subscriptions is service-role-write-only (P7.2D + P8.3 revokes);
-- payments likewise service-role-write via its policies. NO new grant.
-- ============================================================================

-- payments.environment — SAFE default 'sandbox' (unstamped ⇒ excluded from revenue).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_environment_chk;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_environment_chk CHECK (environment IN ('sandbox','production'));

-- subscriptions.provider_env — nullable (NULL = not provider-backed yet / trial).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_env text;
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_env_chk;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_provider_env_chk CHECK (provider_env IS NULL OR provider_env IN ('sandbox','production'));

-- Recurring management identifiers (for updateDirectDebit / cancel).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grow_transaction_id    text,
  ADD COLUMN IF NOT EXISTS grow_transaction_token text,
  ADD COLUMN IF NOT EXISTS grow_asmachta          text;

-- DEFENSE-IN-DEPTH (matches the P7.2D / P8.3 subscriptions lockdown): payments
-- writes are already blocked by RLS (RLS enabled; only a SELECT policy), but the
-- default Supabase grants still let anon/authenticated ATTEMPT a write. Revoke them
-- so a customer can NEVER set payments.verified / status / environment / amount via
-- PostgREST — blocked at BOTH the grant layer and RLS. SELECT (org-scoped read via
-- RLS) is retained; service_role remains the sole writer (the verified webhook path).
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;
