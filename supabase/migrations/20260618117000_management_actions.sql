-- ============================================================================
-- ZONO — 0034 · Team Intelligence OS · Management Actions Engine
-- ----------------------------------------------------------------------------
-- EXTENDS the existing Team Intelligence layer (team_intelligence_profiles,
-- team_performance_snapshots, agent_coaching_signals) with: richer agent twin
-- columns, an Office Health profile, an Opportunity-Leakage ledger, and the
-- ranked Management Actions engine. Territory / specialization / forecast reuse
-- the existing agent_locality_performance / agent_property_type_performance /
-- deal_forecasts (no duplicate tables). Purely additive. Org-scoped RLS.
-- ============================================================================

-- 1) team_intelligence_profiles — Agent Digital Twin 2.0 columns.
alter table public.team_intelligence_profiles
  add column if not exists role                      text,
  add column if not exists branch                    text,
  add column if not exists start_date                date,
  add column if not exists communication_score       smallint not null default 0,
  add column if not exists relationship_score        smallint not null default 0,
  add column if not exists strongest_locality        text,
  add column if not exists strongest_property_type   text,
  add column if not exists strongest_customer_type   text,
  add column if not exists ai_strengths              jsonb not null default '[]'::jsonb,
  add column if not exists ai_weaknesses             jsonb not null default '[]'::jsonb;

-- 2) office_intelligence_profiles — one row per organization.
create table if not exists public.office_intelligence_profiles (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  office_health_score    smallint not null default 0,
  health_level           text not null default 'healthy',  -- elite|strong|healthy|warning|critical
  lead_health            smallint not null default 0,
  pipeline_health        smallint not null default 0,
  inventory_health       smallint not null default 0,
  forecast_health        smallint not null default 0,
  communication_health   smallint not null default 0,
  agent_health           smallint not null default 0,
  market_health          smallint not null default 0,
  routing_health         smallint not null default 0,
  matching_health        smallint not null default 0,
  decision_health        smallint not null default 0,
  growth_score           smallint not null default 0,
  risk_score             smallint not null default 0,
  ai_office_summary      text,
  ai_management_plan     text,
  metadata               jsonb not null default '{}'::jsonb,
  last_calculated_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint office_intelligence_profiles_uniq unique (organization_id)
);
create index if not exists office_intelligence_profiles_org_idx on public.office_intelligence_profiles(organization_id);

-- 3) team_opportunity_leaks — where revenue is leaking, ranked by impact.
create table if not exists public.team_opportunity_leaks (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  leak_type             text not null,  -- lead_never_contacted|match_stalled|buyer_no_recommendations|property_no_activity|seller_no_touchpoint|forecast_stalled|deal_at_risk
  entity_type           text,
  entity_id             text,
  owner_user_id         uuid references public.users(id) on delete set null,
  title                 text not null,
  reason                text,
  lost_revenue_impact   bigint not null default 0,
  severity              text not null default 'medium',
  recommended_action    text,
  status                text not null default 'open',
  created_at            timestamptz not null default now()
);
create index if not exists team_opportunity_leaks_org_idx   on public.team_opportunity_leaks(organization_id);
create index if not exists team_opportunity_leaks_type_idx  on public.team_opportunity_leaks(leak_type);
create index if not exists team_opportunity_leaks_owner_idx on public.team_opportunity_leaks(owner_user_id);

-- 4) management_actions — ranked daily actions for the office manager.
create table if not exists public.management_actions (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  action_type               text not null,  -- rebalance_leads|coach_agent|recruit_locality|recover_deal|resolve_objection|give_leads|review_overloaded|publish_property|seller_touchpoint
  title                     text not null,
  reason                    text,
  priority_score            smallint not null default 0,
  urgency_score             smallint not null default 0,
  impact_score              smallint not null default 0,
  expected_revenue_impact   bigint not null default 0,
  expected_conversion_lift  smallint not null default 0,
  recommended_owner_id      uuid references public.users(id) on delete set null,
  entity_type               text,
  entity_id                 text,
  href                      text,
  rank_position             integer,
  status                    text not null default 'open',
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists management_actions_org_idx  on public.management_actions(organization_id);
create index if not exists management_actions_rank_idx on public.management_actions(priority_score desc);
create index if not exists management_actions_type_idx on public.management_actions(action_type);

-- updated_at triggers
drop trigger if exists trg_office_intelligence_profiles_updated on public.office_intelligence_profiles;
create trigger trg_office_intelligence_profiles_updated before update on public.office_intelligence_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists trg_management_actions_updated on public.management_actions;
create trigger trg_management_actions_updated before update on public.management_actions
  for each row execute function public.set_updated_at();

-- RLS — office-level intelligence is manager-only; leaks/actions managers org-wide,
-- agents may see items addressed to them.
alter table public.office_intelligence_profiles enable row level security;
drop policy if exists "office_intelligence_profiles_select" on public.office_intelligence_profiles;
create policy "office_intelligence_profiles_select" on public.office_intelligence_profiles for select to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'));
drop policy if exists "office_intelligence_profiles_write" on public.office_intelligence_profiles;
create policy "office_intelligence_profiles_write" on public.office_intelligence_profiles for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

alter table public.team_opportunity_leaks enable row level security;
drop policy if exists "team_opportunity_leaks_select" on public.team_opportunity_leaks;
create policy "team_opportunity_leaks_select" on public.team_opportunity_leaks for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or owner_user_id = auth.uid()));
drop policy if exists "team_opportunity_leaks_write" on public.team_opportunity_leaks;
create policy "team_opportunity_leaks_write" on public.team_opportunity_leaks for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

alter table public.management_actions enable row level security;
drop policy if exists "management_actions_select" on public.management_actions;
create policy "management_actions_select" on public.management_actions for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or recommended_owner_id = auth.uid()));
drop policy if exists "management_actions_write" on public.management_actions;
create policy "management_actions_write" on public.management_actions for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

grant select, insert, update, delete on
  public.office_intelligence_profiles, public.team_opportunity_leaks, public.management_actions to authenticated;
grant all privileges on
  public.office_intelligence_profiles, public.team_opportunity_leaks, public.management_actions to service_role;
