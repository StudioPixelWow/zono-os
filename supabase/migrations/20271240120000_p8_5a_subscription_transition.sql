-- ============================================================================
-- P8.5A — ATOMIC SUBSCRIPTION STATUS TRANSITION (guarded RPC). Additive.
-- ----------------------------------------------------------------------------
-- Concurrency safety for lifecycle status transitions (trial expiry, recovery,
-- cancellation, etc.). The reconciler computes a decision purely, then commits a
-- status change through THIS atomic, conditional RPC: it updates only WHERE the
-- current status still equals the expected `p_from`. Two concurrent reconcilers
-- therefore cannot both transition — the loser matches 0 rows and no-ops. This is
-- the same guarded-RPC pattern as P7 (invitation/limit guards) and P8.3
-- (reconcile_subscription_quantity): SECURITY DEFINER, service_role-only, revoked
-- from anon/authenticated. It changes NO schema, creates NO rows, deletes nothing.
-- The status vocabulary is the existing legacy subscriptions.status set (the
-- canonical BillingState is derived from it at read time).
--
-- WHY A MIGRATION: application-memory locks cannot make the read-modify-write of a
-- status transition atomic across concurrent reconcilers / a webhook + a cron. A DB
-- conditional update is the smallest safe mechanism. No RLS/grant change to tables.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transition_subscription_status(
  p_org uuid,
  p_from text,
  p_to text,
  p_now timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed integer;
BEGIN
  IF p_to NOT IN ('trial','pending_payment','active','suspended','cancelled','expired','grace_period') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_to;
  END IF;
  UPDATE public.subscriptions s
     SET status = p_to, updated_at = p_now
   WHERE s.org_id = p_org
     AND s.status = p_from;   -- conditional: only the reconciler seeing p_from wins
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_subscription_status(uuid,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_subscription_status(uuid,text,text,timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.transition_subscription_status(uuid,text,text,timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transition_subscription_status(uuid,text,text,timestamptz) TO service_role;
