-- ============================================================================
-- ZONO — PHASE 26.7: AI SWOT + Executive Agency Summary™
-- ----------------------------------------------------------------------------
-- Structured, auditable agency intelligence reports (executive summary, SWOT,
-- competitive positioning, recommendations) built ONLY from real stored data.
-- Additive + idempotent. A report is identified by
--   (organization_id, agency_id, report_type, period_start, period_end)
-- so regeneration upserts in place. RLS via current_org_id(). No mock data.
-- ============================================================================

create table if not exists public.agency_intelligence_reports (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  report_type       text not null,        -- executive_summary | swot | competitive_position | full_report
  period_start      timestamptz,
  period_end        timestamptz,
  executive_summary text,
  strengths         jsonb not null default '[]'::jsonb,
  weaknesses        jsonb not null default '[]'::jsonb,
  opportunities     jsonb not null default '[]'::jsonb,
  threats           jsonb not null default '[]'::jsonb,
  recommendations   jsonb not null default '[]'::jsonb,
  key_signals       jsonb not null default '[]'::jsonb,
  key_scores        jsonb not null default '{}'::jsonb,
  data_confidence   numeric,              -- 0..100
  source_snapshot   jsonb not null default '{}'::jsonb,
  generated_by      text,                 -- engine version / actor
  generated_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, agency_id, report_type, period_start, period_end)
);

create index if not exists agency_reports_org_idx     on public.agency_intelligence_reports(organization_id);
create index if not exists agency_reports_agency_idx   on public.agency_intelligence_reports(agency_id, report_type, generated_at desc);
create index if not exists agency_reports_type_idx     on public.agency_intelligence_reports(organization_id, report_type);

-- ── updated_at trigger ───────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at')
     and not exists (select 1 from pg_trigger where tgname = 'trg_agency_intelligence_reports_updated') then
    execute 'create trigger trg_agency_intelligence_reports_updated before update on public.agency_intelligence_reports for each row execute function public.set_updated_at();';
  end if;
end $$;

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.agency_intelligence_reports enable row level security;';

  execute 'drop policy if exists agency_intelligence_reports_select on public.agency_intelligence_reports;';
  execute 'create policy agency_intelligence_reports_select on public.agency_intelligence_reports for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists agency_intelligence_reports_insert on public.agency_intelligence_reports;';
  execute 'create policy agency_intelligence_reports_insert on public.agency_intelligence_reports for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_intelligence_reports_update on public.agency_intelligence_reports;';
  execute 'create policy agency_intelligence_reports_update on public.agency_intelligence_reports for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_intelligence_reports_delete on public.agency_intelligence_reports;';
  execute 'create policy agency_intelligence_reports_delete on public.agency_intelligence_reports for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.agency_intelligence_reports to authenticated;';
  execute 'grant all privileges on public.agency_intelligence_reports to service_role;';
end $$;
