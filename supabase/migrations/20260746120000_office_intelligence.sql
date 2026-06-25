-- ============================================================================
-- ZONO — Phase 16: Office Intelligence™ & Brokerage Operating System.
-- ----------------------------------------------------------------------------
-- Executive operating system for managers/owners. These 4 NEW org-scoped tables
-- store goals, daily snapshots (heavy historical analytics), generated reports
-- and deterministic coaching items. They do NOT touch existing engines — Office
-- Intelligence READS the deterministic engines and composes; AI only summarizes.
-- Additive + idempotent. RLS: org-scoped, manager+ read, service role writes.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- A. office_goals -------------------------------------------------------------
create table if not exists public.office_goals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid references public.users(id) on delete set null,
  goal_type     text not null,   -- listings/exclusives/calls/meetings/buyer_matches/revenue/commission/tasks_completed
  period        text not null default 'monthly', -- daily/weekly/monthly/quarterly
  target_value  numeric not null default 0,
  current_value numeric not null default 0,
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        text not null default 'active',  -- active/archived
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists og_org_idx    on public.office_goals(org_id);
create index if not exists og_owner_idx    on public.office_goals(owner_user_id);
create index if not exists og_status_idx   on public.office_goals(status);

-- B. office_intelligence_snapshots --------------------------------------------
create table if not exists public.office_intelligence_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  snapshot_date date not null default current_date,
  period        text not null default 'daily',   -- daily/weekly/monthly
  kpis          jsonb not null default '{}'::jsonb,
  agent_metrics jsonb not null default '[]'::jsonb,
  risk_items    jsonb not null default '[]'::jsonb,
  opportunities jsonb not null default '[]'::jsonb,
  forecasts     jsonb not null default '{}'::jsonb,
  benchmarks    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (org_id, snapshot_date, period)
);
create index if not exists ois_org_idx  on public.office_intelligence_snapshots(org_id);
create index if not exists ois_date_idx  on public.office_intelligence_snapshots(snapshot_date);

-- C. office_reports -----------------------------------------------------------
create table if not exists public.office_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  report_type text not null default 'daily',  -- daily/weekly/monthly/custom
  title       text,
  status      text not null default 'draft',  -- draft/generated/exported/archived
  date_from   date,
  date_to     date,
  payload     jsonb not null default '{}'::jsonb,
  pdf_url     text,
  excel_url   text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists orp_org_idx  on public.office_reports(org_id);
create index if not exists orp_type_idx  on public.office_reports(report_type);

-- D. office_coaching_items ----------------------------------------------------
create table if not exists public.office_coaching_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  agent_id            uuid references public.users(id) on delete set null,
  item_type           text not null,  -- overdue_tasks/low_activity/missed_opportunity/slow_followup/weak_conversion/high_potential
  severity            text not null default 'medium', -- low/medium/high/urgent
  title               text not null,
  message             text,
  recommended_action  text,
  status              text not null default 'open',   -- open/seen/dismissed/resolved
  related_entity_type text,
  related_entity_id   uuid,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
create index if not exists oci_org_idx     on public.office_coaching_items(org_id);
create index if not exists oci_agent_idx    on public.office_coaching_items(agent_id);
create index if not exists oci_status_idx   on public.office_coaching_items(status);

drop trigger if exists trg_office_goals_updated on public.office_goals;
create trigger trg_office_goals_updated before update on public.office_goals for each row execute function public.set_updated_at();
drop trigger if exists trg_office_reports_updated on public.office_reports;
create trigger trg_office_reports_updated before update on public.office_reports for each row execute function public.set_updated_at();

-- RLS — org-scoped; manager+ may read/manage; service role writes snapshots etc.
do $$
declare t text;
begin
  foreach t in array array['office_goals','office_intelligence_snapshots','office_reports','office_coaching_items'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager')) with check (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
