-- ============================================================================
-- ZONO — P7.2B server-authoritative limits hardening. STATUS: PROPOSED.
-- Closes the P7.2 rollout blocker: an authenticated org admin/owner could raise
-- their OWN enforced limits by writing org_plans.limits through the billing RLS
-- policy `opl_write` (cmd=ALL, authenticated, org_id=current_org_id() AND
-- has_min_role('admin')), a direct-PostgREST self-entitlement escalation.
--
-- AUDIT RESULT (why this is safe): EVERY legitimate org_plans writer runs through
-- the SERVICE-ROLE client, never the authenticated RLS client —
--   • launch upsertPlan  (plan change / onboarding / self-service) → createLaunchRepository(createServiceRoleClient())
--   • setOrgLimitOverride (platform operator, capability-gated)     → createServiceRoleClient()
-- No application flow writes org_plans as `authenticated`, so removing the
-- customer write path breaks nothing. Reads stay intact (opl_select).
--
-- DESIGN (smallest safe change): make ALL org_plans writes server-authoritative.
--   1. drop the permissive write policy `opl_write` (RLS then denies every
--      authenticated/anon write — no permissive write policy remains).
--   2. revoke ALL privileges from authenticated + anon (defense-in-depth at the
--      grant layer, incl. any column-level UPDATE on `limits`), then re-grant
--      only SELECT to authenticated so the plan/limits READ paths keep working.
-- service_role and postgres are untouched — service_role BYPASSES RLS and keeps
-- its grants, so plan changes, onboarding, and platform overrides are unaffected.
--
-- Not chosen: (A) column-only REVOKE UPDATE(limits) — insufficient, opl_write
-- ALL still permits INSERT/DELETE + other-column tampering; (B) BEFORE-UPDATE
-- trigger — must special-case service_role, misses INSERT/DELETE, fragile;
-- (C) split operator-only limits table — larger change, touches every reader,
-- unnecessary since org_plans writes are already service-role-only.
--
-- No prices/plans/Grow/payment behavior changed. No destructive schema change.
-- Additive/hardening only.
-- ============================================================================

-- 1) remove the only permissive customer WRITE policy on org_plans
drop policy if exists opl_write on public.org_plans;

-- 2) grant-layer defense-in-depth: no writes for customer roles; keep reads
revoke all privileges on public.org_plans from authenticated, anon;
grant select on public.org_plans to authenticated;

-- (opl_select stays: authenticated may SELECT its own org row only.
--  service_role + postgres retain full access and bypass RLS → all legitimate
--  server-side writers, incl. setOrgLimitOverload/upsertPlan, keep working.)

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- create policy opl_write on public.org_plans for all to authenticated
--   using (org_id = current_org_id() and has_min_role('admin'))
--   with check (org_id = current_org_id() and has_min_role('admin'));
-- grant insert, update, delete on public.org_plans to authenticated;
