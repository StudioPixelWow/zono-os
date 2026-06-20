-- ============================================================================
-- ZONO — 0035 · Revenue Intelligence OS
-- ----------------------------------------------------------------------------
-- A revenue operating layer that AGGREGATES existing engines (deal_forecasts,
-- team intelligence, opportunity leaks, locality/property performance,
-- acquisition, management actions). Does not modify any existing module.
-- New persisted artifacts: org revenue profile, revenue targets, leakage ledger.
-- Org-scoped, RLS. Deterministic. Idempotent.
-- ============================================================================

-- 1) organization_revenue_profiles — one row per organization.
create table if not exists public.organization_revenue_profiles (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  current_month_revenue         bigint not null default 0,
  current_quarter_revenue       bigint not null default 0,
  current_year_revenue          bigint not null default 0,
  forecast_revenue_30           bigint not null default 0,
  forecast_revenue_60           bigint not null default 0,
  forecast_revenue_90           bigint not null default 0,
  probability_weighted_revenue  bigint not null default 0,
  revenue_at_risk               bigint not null default 0,
  lost_revenue                  bigint not null default 0,
  recovered_revenue             bigint not null default 0,
  revenue_gap                   bigint not null default 0,
  growth_rate                   numeric(7,2) not null default 0,
  forecast_confidence           smallint not null default 0,
  revenue_gap_score             smallint not null default 0,
  gap_level                     text not null default 'on_track',  -- on_track|watch|risk|critical
  ai_revenue_summary            text,
  metadata                      jsonb not null default '{}'::jsonb,
  last_calculated_at            timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint organization_revenue_profiles_uniq unique (organization_id)
);
create index if not exists organization_revenue_profiles_org_idx on public.organization_revenue_profiles(organization_id);

-- 2) revenue_targets — flexible scope (org/branch/agent/property_type/locality) + period.
create table if not exists public.revenue_targets (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  scope_type         text not null default 'organization',  -- organization|branch|agent|property_type|locality
  scope_id           text,                                  -- user_id / type / locality / null for org
  scope_label        text,
  period_type        text not null default 'monthly',       -- monthly|quarterly|yearly
  period_start       date not null,
  target_amount      bigint not null default 0,
  actual_amount      bigint not null default 0,
  forecast_amount    bigint not null default 0,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint revenue_targets_uniq unique (organization_id, scope_type, scope_id, period_type, period_start)
);
create index if not exists revenue_targets_org_idx    on public.revenue_targets(organization_id);
create index if not exists revenue_targets_scope_idx  on public.revenue_targets(scope_type, scope_id);
create index if not exists revenue_targets_period_idx on public.revenue_targets(period_type, period_start);

-- 3) revenue_leakage_events — revenue lost, ranked (mirrors team_opportunity_leaks + forecast risk).
create table if not exists public.revenue_leakage_events (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  source             text not null,  -- uncontacted_lead|stalled_match|inactive_property|inactive_seller|broken_commitment|at_risk_deal
  entity_type        text,
  entity_id          text,
  owner_user_id      uuid references public.users(id) on delete set null,
  title              text not null,
  reason             text,
  lost_revenue       bigint not null default 0,
  recoverable        boolean not null default true,
  severity           text not null default 'medium',
  status             text not null default 'open',
  created_at         timestamptz not null default now()
);
create index if not exists revenue_leakage_events_org_idx    on public.revenue_leakage_events(organization_id);
create index if not exists revenue_leakage_events_source_idx on public.revenue_leakage_events(source);
create index if not exists revenue_leakage_events_owner_idx  on public.revenue_leakage_events(owner_user_id);

-- updated_at triggers
drop trigger if exists trg_organization_revenue_profiles_updated on public.organization_revenue_profiles;
create trigger trg_organization_revenue_profiles_updated before update on public.organization_revenue_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists trg_revenue_targets_updated on public.revenue_targets;
create trigger trg_revenue_targets_updated before update on public.revenue_targets
  for each row execute function public.set_updated_at();

-- RLS — revenue is office-level; managers org-wide. Agents may see leakage/targets
-- addressed to them.
alter table public.organization_revenue_profiles enable row level security;
drop policy if exists "organization_revenue_profiles_select" on public.organization_revenue_profiles;
create policy "organization_revenue_profiles_select" on public.organization_revenue_profiles for select to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'));
drop policy if exists "organization_revenue_profiles_write" on public.organization_revenue_profiles;
create policy "organization_revenue_profiles_write" on public.organization_revenue_profiles for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

alter table public.revenue_targets enable row level security;
drop policy if exists "revenue_targets_select" on public.revenue_targets;
create policy "revenue_targets_select" on public.revenue_targets for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or (scope_type = 'agent' and scope_id = auth.uid()::text)));
drop policy if exists "revenue_targets_write" on public.revenue_targets;
create policy "revenue_targets_write" on public.revenue_targets for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

alter table public.revenue_leakage_events enable row level security;
drop policy if exists "revenue_leakage_events_select" on public.revenue_leakage_events;
create policy "revenue_leakage_events_select" on public.revenue_leakage_events for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or owner_user_id = auth.uid()));
drop policy if exists "revenue_leakage_events_write" on public.revenue_leakage_events;
create policy "revenue_leakage_events_write" on public.revenue_leakage_events for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on
  public.organization_revenue_profiles, public.revenue_targets, public.revenue_leakage_events to authenticated;
grant all privileges on
  public.organization_revenue_profiles, public.revenue_targets, public.revenue_leakage_events to service_role;
