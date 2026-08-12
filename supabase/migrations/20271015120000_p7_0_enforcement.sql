-- ============================================================================
-- ZONO — P7.0 Enforcement Readiness · ADDITIVE migration.
-- STATUS: PROPOSED — NOT APPLIED. Requires explicit approval (migration gate).
--
-- Two additive objects, no changes to existing tables/data/RLS:
--   1. enforcement_config — the config-only mode store (OFF/SHADOW/PILOT/ENFORCED)
--      per (scope, org, control). This is the KILL SWITCH: flipping ENFORCED→SHADOW
--      is a single row update, no code deploy. Absent row → SHADOW (safe default).
--   2. enforce_limit_lock(org, key) — a transaction-scoped ADVISORY LOCK helper
--      that lets a future enforced mutation serialize its check-then-insert, so
--      concurrency-sensitive limits (seats/areas/listings) cannot over-admit
--      (the limit=10/usage=9/two-concurrent → 11 race). Callers wrap:
--        BEGIN; select enforce_limit_lock(org,'seats'); <count>; <insert if within>; COMMIT;
--      Concurrent callers on the same (org,key) serialize; the count is taken
--      AFTER the lock, so exactly one create wins at the boundary.
--
-- P7.0 ships NO enforcement: default mode is SHADOW and nothing calls the lock
-- yet. This migration only makes safe enforcement POSSIBLE for a later pilot.
-- ============================================================================

create table if not exists public.enforcement_config (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null default 'global',          -- 'global' | 'org'
  organization_id uuid references public.organizations(id) on delete cascade, -- null for global
  control_type    text not null,                           -- 'feature' | 'limit'
  control_key     text not null,                           -- e.g. 'seats', 'ai_copilot'
  mode            text not null default 'SHADOW',          -- OFF | SHADOW | PILOT | ENFORCED
  reason          text,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint enforcement_config_scope_chk check (scope in ('global','org')),
  constraint enforcement_config_type_chk  check (control_type in ('feature','limit')),
  constraint enforcement_config_mode_chk  check (mode in ('OFF','SHADOW','PILOT','ENFORCED')),
  -- one row per (scope, org, control_type, control_key); global rows have null org
  constraint enforcement_config_uniq unique (scope, organization_id, control_type, control_key)
);

create index if not exists enforcement_config_lookup_idx
  on public.enforcement_config (control_type, control_key, scope, organization_id);

alter table public.enforcement_config enable row level security;
revoke all on public.enforcement_config from anon, authenticated;

-- Transaction-scoped advisory lock keyed on (org, limit key). Serializes
-- check-then-insert for concurrency-sensitive limits within one transaction.
create or replace function public.enforce_limit_lock(p_org uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_key, 0));
end;
$$;

revoke all on function public.enforce_limit_lock(uuid, text) from anon, authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop function if exists public.enforce_limit_lock(uuid, text);
-- drop table if exists public.enforcement_config;
