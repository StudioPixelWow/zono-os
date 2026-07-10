-- ============================================================================
-- ZONO OS 2.0 — STABILIZATION · Fix ai_memory broker-private RLS leak.
-- ----------------------------------------------------------------------------
-- PROBLEM: the QA.1 coverage pack (20260907120000_qa1_rls_coverage.sql) added a
-- permissive SELECT policy `ai_memory_qa1_read` gated ONLY by
--   organization_id = current_org_id()
-- Postgres OR-combines permissive policies, so this OVERRODE the private gate in
-- `ai_memory_select` (20260807120000_ai_memory.sql), letting any org member read
-- any other broker's visibility='private' / scope_type='user' memory.
--
-- FIX: re-scope `ai_memory_qa1_read` to the SAME predicate as `ai_memory_select`
-- so OR-combining is safe (both gated identically). Private memory is visible
-- ONLY to its owner; office/organization/system memory is org-wide; managers get
-- no extra READ access to others' private rows (matches the base SELECT policy —
-- manager elevation exists only on UPDATE/DELETE, unchanged here).
--
-- Strictly additive + idempotent + re-runnable. No data change. Non-breaking:
-- it can only REDUCE over-broad read access back to the intended boundary.
-- Rollback: `drop policy if exists "ai_memory_qa1_read" on public.ai_memory;`
-- (leaving `ai_memory_select` as the sole, correct gate).
-- ============================================================================

alter table public.ai_memory enable row level security;

drop policy if exists "ai_memory_qa1_read" on public.ai_memory;

create policy "ai_memory_qa1_read" on public.ai_memory
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_min_role('agent')
    and (visibility in ('office', 'organization', 'system') or user_id = auth.uid())
  );

-- Sanity note (not executed): after this migration the EFFECTIVE SELECT condition
-- is (ai_memory_select OR ai_memory_qa1_read) = the same private/owner gate, so a
-- broker can never read another broker's private/user-scoped memory in the org.
