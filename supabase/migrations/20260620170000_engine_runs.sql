-- ============================================================================
-- ZONO — 0045 · Engine run log (Recompute Center / System Health)
-- ----------------------------------------------------------------------------
-- One row per recompute of an intelligence engine, so managers can see what is
-- fresh / stale / failing and trigger recomputes in the correct dependency
-- order. Org-scoped. Writes happen via the service role from the system service
-- (manager-gated in code); readable by the org's members. Idempotent.
-- ============================================================================

create table if not exists public.engine_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  engine_key       text not null,
  status           text not null default 'running',   -- running | success | error
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  duration_ms      integer,
  rows_processed   integer,
  result_summary   jsonb not null default '{}'::jsonb,
  error_message    text,
  triggered_by     uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists engine_runs_org_idx on public.engine_runs(organization_id);
create index if not exists engine_runs_engine_idx on public.engine_runs(organization_id, engine_key, started_at desc);

alter table public.engine_runs enable row level security;

drop policy if exists "engine_runs_select" on public.engine_runs;
create policy "engine_runs_select" on public.engine_runs
  for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "engine_runs_insert" on public.engine_runs;
create policy "engine_runs_insert" on public.engine_runs
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

drop policy if exists "engine_runs_update" on public.engine_runs;
create policy "engine_runs_update" on public.engine_runs
  for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id());

grant select, insert, update on public.engine_runs to authenticated;
grant all privileges on public.engine_runs to service_role;
