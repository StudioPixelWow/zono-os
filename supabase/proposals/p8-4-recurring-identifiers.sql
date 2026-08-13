-- ============================================================================
-- P8.4 MIGRATION PROPOSAL — recurring transaction identifiers (NOT APPLIED).
-- ----------------------------------------------------------------------------
-- STATUS: PROPOSAL ONLY (supabase/proposals/, NOT migrations/). Do NOT auto-apply.
-- Per P8.4 §25, stop at the migration gate before applying.
--
-- WHY: P8.4 initial activation + first provider_quantity ACK need NO new columns
-- (they reuse the P8.3 columns + subscriptions.grow_subscription_id for the Grow
-- recurringDebitId). But the NEXT-CYCLE quantity change (locked Decision A) is
-- performed via Grow's `updateDirectDebit`, which references the recurring payment
-- by transactionId + transactionToken + asmachta (NOT by recurringDebitId). Those
-- three identifiers are returned in the verified callback and must be persisted to
-- later change the recurring amount or cancel it. The current schema cannot store
-- them, so the amount-update / cancel path is gated on this migration.
--
-- STRICT: additive, nullable only. No destructive rewrite; no status/trial change;
-- no Pixel/RE-MAX change; creates NO rows. subscriptions is service-role-write-only
-- (P7.2D + P8.3 revokes) — these columns inherit that; the browser can NEVER write
-- them. NO new grant. Values are provider identifiers (not card data/secrets).
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grow_transaction_id    text,   -- Grow transactionId (for updateDirectDebit)
  ADD COLUMN IF NOT EXISTS grow_transaction_token text,   -- Grow transactionToken
  ADD COLUMN IF NOT EXISTS grow_asmachta          text;   -- Grow asmachta (approval reference)

-- No new index required (looked up by org_id, the PK). No RLS/grant change:
-- subscriptions already denies anon/authenticated INSERT/UPDATE/DELETE (P8.3);
-- service_role remains the sole writer, only from the verified-callback path.

COMMIT;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   ALTER TABLE public.subscriptions
--     DROP COLUMN IF EXISTS grow_asmachta,
--     DROP COLUMN IF EXISTS grow_transaction_token,
--     DROP COLUMN IF EXISTS grow_transaction_id;
-- COMMIT;

-- SECURITY IMPACT: none beyond storing three provider reference strings needed to
-- manage the recurring subscription. They are not card numbers, not secrets, and
-- are never surfaced in Platform Admin / Customer 360 DTOs.
