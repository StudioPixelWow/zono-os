-- ============================================================================
-- ZONO — PHASE 26.11: Daily Agency Intelligence Job™
-- ----------------------------------------------------------------------------
-- One run-log table for the orchestrated daily agency-intelligence pipeline.
-- Each pipeline execution writes one row (job_name='daily_agency_intelligence')
-- transitioning running → success | partial_success | failed, with the full
-- structured per-step result in `result` (jsonb). Additive + idempotent.
-- Org column: organization_id. RLS via current_org_id() + has_min_role().
-- ============================================================================

create table if not exists public.agency_intelligence_job_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  job_name          text not null,                          -- daily_agency_intelligence | <step name>
  status            text not null default 'queued',         -- queued|running|success|partial_success|failed
  started_at        timestamptz,
  finished_at       timestamptz,
  duration_ms       integer,
  result            jsonb not null default '{}'::jsonb,      -- structured per-step result (secrets redacted)
  error_message     text,
  created_at        timestamptz not null default now()
);

create index if not exists agency_job_runs_org_idx     on public.agency_intelligence_job_runs(organization_id);
create index if not exists agency_job_runs_name_idx    on public.agency_intelligence_job_runs(organization_id, job_name);
create index if not exists agency_job_runs_status_idx  on public.agency_intelligence_job_runs(organization_id, status);
create index if not exists agency_job_runs_latest_idx  on public.agency_intelligence_job_runs(organization_id, created_at desc);

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.agency_intelligence_job_runs enable row level security;';

  execute 'drop policy if exists agency_job_runs_select on public.agency_intelligence_job_runs;';
  execute 'create policy agency_job_runs_select on public.agency_intelligence_job_runs for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists agency_job_runs_insert on public.agency_intelligence_job_runs;';
  execute 'create policy agency_job_runs_insert on public.agency_intelligence_job_runs for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_job_runs_update on public.agency_intelligence_job_runs;';
  execute 'create policy agency_job_runs_update on public.agency_intelligence_job_runs for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_job_runs_delete on public.agency_intelligence_job_runs;';
  execute 'create policy agency_job_runs_delete on public.agency_intelligence_job_runs for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.agency_intelligence_job_runs to authenticated;';
  execute 'grant all privileges on public.agency_intelligence_job_runs to service_role;';
end $$;
