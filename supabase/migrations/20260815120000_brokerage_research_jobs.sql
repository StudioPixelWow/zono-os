-- ============================================================================
-- ZONO — Persistent Background Research Jobs™ (Phase 26.4.15). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- A resumable, checkpointed job that learns a city's brokerage market across
-- MULTIPLE requests (no single serverless request must finish it). Each stage
-- writes a checkpoint; a timeout leaves progress intact and the next run resumes
-- from the last checkpoint. This is infrastructure for Brokerage Research only —
-- it does NOT touch valuation / BIE / MAI / verification rules / other schema.
-- ============================================================================

create table if not exists public.brokerage_research_jobs (
  id                              uuid primary key default gen_random_uuid(),
  organization_id                 uuid,
  city                            text not null,
  normalized_city                 text not null,
  status                          text not null default 'queued',      -- queued | running | waiting | completed | failed | cancelled
  depth                           text not null default 'standard',    -- quick | standard | deep
  current_stage                   text not null default 'INIT',
  progress_percent                integer not null default 0,
  searches_completed              integer not null default 0,
  candidates_found                integer not null default 0,
  candidates_saved                integer not null default 0,
  candidates_verified             integer not null default 0,
  candidates_researching          integer not null default 0,
  candidates_waiting_for_evidence integer not null default 0,
  candidates_rejected             integer not null default 0,
  errors                          jsonb  not null default '[]'::jsonb,
  checkpoints                     jsonb  not null default '{}'::jsonb,  -- { stagesDone: [], ... }
  logs                            jsonb  not null default '[]'::jsonb,  -- per-stage observability
  result_summary                  jsonb,
  started_at                      timestamptz,
  updated_at                      timestamptz not null default now(),
  completed_at                    timestamptz,
  created_by                      uuid
);
create index if not exists brj_org_city_idx on public.brokerage_research_jobs (organization_id, normalized_city);
create index if not exists brj_status_idx    on public.brokerage_research_jobs (status);
create index if not exists brj_updated_idx    on public.brokerage_research_jobs (updated_at desc);

alter table public.brokerage_research_jobs enable row level security;

-- Org members may READ their org's jobs (zono owner sees all). All WRITES happen
-- through the service-role worker (bypasses RLS), so no write policy is granted.
drop policy if exists brj_select on public.brokerage_research_jobs;
create policy brj_select on public.brokerage_research_jobs for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

grant select on public.brokerage_research_jobs to authenticated;
grant all    on public.brokerage_research_jobs to service_role;
