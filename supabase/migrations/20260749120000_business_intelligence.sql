-- ============================================================================
-- ZONO — Phase 19: Executive Business Intelligence™ & Predictive Analytics.
-- ----------------------------------------------------------------------------
-- The executive business brain. It CONSUMES outputs from every deterministic
-- engine (Property Radar, Buyer Matching, Seller Intelligence, Exclusive
-- Acquisition, Office Intelligence, Competitor Intelligence, Journey Automation)
-- and aggregates them into executive KPIs, pipeline, forecasts, ROI, health and
-- risk. All business calculations stay deterministic; AI summarizes only.
--
-- Two additive tables: daily executive snapshots + generated reports.
-- Org-scoped RLS. Conventions: current_org_id(), has_min_role(), set_updated_at().
-- ============================================================================

-- A. bi_snapshots — daily executive snapshot (KPIs/forecasts/pipeline/health…) -
create table if not exists public.bi_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  snapshot_date date not null default current_date,
  kpis          jsonb not null default '{}'::jsonb,
  forecast      jsonb not null default '{}'::jsonb,
  pipeline      jsonb not null default '{}'::jsonb,
  health        jsonb not null default '{}'::jsonb,
  roi           jsonb not null default '{}'::jsonb,
  revenue       jsonb not null default '{}'::jsonb,
  risk          jsonb not null default '{}'::jsonb,
  benchmarks    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (org_id, snapshot_date)
);
create index if not exists bis_org_idx  on public.bi_snapshots(org_id);
create index if not exists bis_date_idx  on public.bi_snapshots(org_id, snapshot_date desc);

-- B. bi_reports — generated executive / board / investor / area reports --------
create table if not exists public.bi_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  report_type text not null default 'executive_daily',  -- executive_daily/weekly/monthly/board/investor/office/area
  title       text,
  format      text not null default 'json',             -- pdf/excel/csv/json (payload is canonical JSON)
  period_from date,
  period_to   date,
  payload     jsonb not null default '{}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bir_org_idx  on public.bi_reports(org_id);
create index if not exists bir_type_idx  on public.bi_reports(org_id, report_type);

drop trigger if exists trg_bi_reports_updated on public.bi_reports;
create trigger trg_bi_reports_updated before update on public.bi_reports for each row execute function public.set_updated_at();

-- RLS — org-scoped read for members; manager+ may write; service role snapshots.
do $$
declare t text;
begin
  foreach t in array array['bi_snapshots','bi_reports'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager')) with check (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
