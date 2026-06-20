-- ============================================================================
-- ZONO — 0032 · Team Intelligence OS (Brokerage Management Layer)
-- ----------------------------------------------------------------------------
-- The organizational performance layer. Turns ZONO into a Brokerage Management
-- Operating System: per-agent performance profiles, daily office snapshots and
-- coaching signals. Deterministic, AI-ready (ai_* text only, no AI calls).
-- Org-scoped. Managers see the whole office; agents see only their own profile.
-- ============================================================================

-- 1) team_intelligence_profiles (one per agent)
create table public.team_intelligence_profiles (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  user_id                     uuid not null references public.users(id) on delete cascade,
  -- Performance scores (0..100)
  performance_score           smallint not null default 0,
  revenue_score               smallint not null default 0,
  conversion_score            smallint not null default 0,
  activity_score              smallint not null default 0,
  responsiveness_score        smallint not null default 0,
  workload_score              smallint not null default 0,
  forecast_score              smallint not null default 0,
  client_satisfaction_score   smallint not null default 0,
  reliability_score           smallint not null default 0,
  coaching_score              smallint not null default 0,
  -- Metrics
  active_leads                integer not null default 0,
  active_buyers               integer not null default 0,
  active_sellers              integer not null default 0,
  active_properties           integer not null default 0,
  active_matches              integer not null default 0,
  total_revenue               bigint  not null default 0,
  forecast_revenue            bigint  not null default 0,
  won_deals                   integer not null default 0,
  lost_deals                  integer not null default 0,
  avg_days_to_close           integer,
  avg_response_time           integer,
  locality_count              integer not null default 0,
  property_type_count         integer not null default 0,
  -- Classification
  performance_tier            text not null default 'stable',  -- elite|strong|stable|declining|critical
  growth_trend                text not null default 'flat',    -- improving|flat|declining
  -- Insights (AI-ready)
  strengths                   jsonb not null default '[]'::jsonb,
  weaknesses                  jsonb not null default '[]'::jsonb,
  coaching_priorities         jsonb not null default '[]'::jsonb,
  ai_summary                  text,
  ai_growth_plan              text,
  ai_coaching_plan            text,
  last_calculated_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint team_intelligence_profiles_uniq unique (organization_id, user_id)
);
create index team_intelligence_profiles_org_idx   on public.team_intelligence_profiles(organization_id);
create index team_intelligence_profiles_user_idx  on public.team_intelligence_profiles(user_id);
create index team_intelligence_profiles_perf_idx  on public.team_intelligence_profiles(performance_score desc);
create index team_intelligence_profiles_tier_idx  on public.team_intelligence_profiles(performance_tier);

-- 2) team_performance_snapshots (daily org-level)
create table public.team_performance_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  date                        date not null default current_date,
  office_health_score         smallint not null default 0,
  office_growth_score         smallint not null default 0,
  office_risk_score           smallint not null default 0,
  office_revenue              bigint  not null default 0,
  office_forecast_revenue     bigint  not null default 0,
  total_agents                integer not null default 0,
  elite_agents                integer not null default 0,
  declining_agents            integer not null default 0,
  overloaded_agents           integer not null default 0,
  underutilized_agents        integer not null default 0,
  coaching_needed             integer not null default 0,
  avg_conversion_rate         numeric(6,2) not null default 0,
  opportunity_leakage         integer not null default 0,
  weak_localities             integer not null default 0,
  agent_rankings              jsonb not null default '[]'::jsonb,
  workload_distribution       jsonb not null default '[]'::jsonb,
  territory_coverage          jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint team_performance_snapshots_uniq unique (organization_id, date)
);
create index team_performance_snapshots_org_idx  on public.team_performance_snapshots(organization_id);
create index team_performance_snapshots_date_idx on public.team_performance_snapshots(date desc);

-- 3) agent_coaching_signals
create table public.agent_coaching_signals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  signal_type       text not null,  -- poor_followup|slow_response|declining_conversion|overloaded|underutilized|weak_locality_coverage|strong_specialization|high_opportunity_loss|forecast_gap
  severity          text not null default 'medium', -- low|medium|high|critical
  confidence_score  smallint not null default 60,
  impact_score      smallint not null default 50,
  title             text not null,
  description       text,
  recommendation    text,
  metadata          jsonb not null default '{}'::jsonb,
  status            text not null default 'open',
  created_at        timestamptz not null default now()
);
create index agent_coaching_signals_org_idx   on public.agent_coaching_signals(organization_id);
create index agent_coaching_signals_user_idx  on public.agent_coaching_signals(user_id);
create index agent_coaching_signals_type_idx  on public.agent_coaching_signals(signal_type);

-- updated_at triggers
create trigger trg_team_intelligence_profiles_updated before update on public.team_intelligence_profiles
  for each row execute function public.set_updated_at();
create trigger trg_team_performance_snapshots_updated before update on public.team_performance_snapshots
  for each row execute function public.set_updated_at();

-- RLS.
-- team_intelligence_profiles: managers org-wide; agents only their own profile.
alter table public.team_intelligence_profiles enable row level security;
create policy "team_intelligence_profiles_select" on public.team_intelligence_profiles for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or user_id = auth.uid()));
create policy "team_intelligence_profiles_write" on public.team_intelligence_profiles for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- agent_coaching_signals: managers org-wide; agents only their own signals.
alter table public.agent_coaching_signals enable row level security;
create policy "agent_coaching_signals_select" on public.agent_coaching_signals for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or user_id = auth.uid()));
create policy "agent_coaching_signals_write" on public.agent_coaching_signals for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- team_performance_snapshots: office-level — managers only.
alter table public.team_performance_snapshots enable row level security;
create policy "team_performance_snapshots_select" on public.team_performance_snapshots for select to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'));
create policy "team_performance_snapshots_write" on public.team_performance_snapshots for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

grant select, insert, update, delete on
  public.team_intelligence_profiles, public.team_performance_snapshots, public.agent_coaching_signals to authenticated;
grant all privileges on
  public.team_intelligence_profiles, public.team_performance_snapshots, public.agent_coaching_signals to service_role;
