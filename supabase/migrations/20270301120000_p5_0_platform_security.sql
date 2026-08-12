-- ============================================================================
-- P5.0 — ZONO Platform Admin: Security & Trust Foundation (ADDITIVE, reversible).
-- ----------------------------------------------------------------------------
-- Creates the PLATFORM operator identity (ZONO staff), DISJOINT from every
-- organization role. Does NOT touch tenant tables, org roles, or existing RLS.
-- Adds the ability to record platform-level (org-less) audit events.
--
-- SAFETY:
--   * platform_operators has RLS ENABLED with NO authenticated policies →
--     normal customers can neither read nor enumerate ZONO operators. Only the
--     service-role server guard (src/lib/platform-admin/server/auth.ts) reads it.
--   * platform_audit_log.org_id becomes NULLABLE so platform events (no single
--     org) can be logged. Existing org-scoped SELECT policy naturally excludes
--     NULL-org rows from customers (org_id = current_org_id() is false for NULL).
--   * No existing column/table is dropped or repurposed.
-- ============================================================================

-- 1) Platform operator identity ---------------------------------------------
create table if not exists public.platform_operators (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  platform_role text not null check (platform_role in
                  ('super_admin','operations','support','billing_admin','developer')),
  status        text not null default 'active' check (status in ('active','suspended')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.platform_operators is
  'ZONO platform staff (Owner Control Plane). DISJOINT from organization roles: an org owner/admin is NOT a platform operator. Authorization is server-side only via src/lib/platform-admin. RLS is enabled with NO authenticated policies so customers cannot read/enumerate operators; only the service-role guard accesses this table.';

alter table public.platform_operators enable row level security;

-- Deny-all for anon/authenticated: no policies are created, and privileges are
-- revoked as defense-in-depth. Only the service-role (server guard) may access.
revoke all on public.platform_operators from anon;
revoke all on public.platform_operators from authenticated;

-- keep updated_at fresh (reuse existing helper if present; else inline)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    execute 'create trigger platform_operators_set_updated_at before update on public.platform_operators for each row execute function public.set_updated_at()';
  end if;
end $$;

-- 2) Platform-level (org-less) audit events ---------------------------------
alter table public.platform_audit_log alter column org_id drop not null;
comment on column public.platform_audit_log.org_id is
  'Nullable since P5.0: NULL = platform-level event not scoped to a single organization (e.g. cross-org customer listing).';

-- ============================================================================
-- ROLLBACK (manual, if ever required):
--   alter table public.platform_audit_log alter column org_id set not null; -- only safe if no NULL rows exist
--   drop table if exists public.platform_operators;
-- (Re-adding NOT NULL requires first deleting/backfilling any platform-scoped
--  audit rows written after this migration.)
-- ============================================================================
