-- ============================================================================
-- ZONO — 0029 · Lead Routing Intelligence OS
-- ----------------------------------------------------------------------------
-- Agent Intelligence Twins + intelligent lead routing. Org-scoped. Managers
-- see office-wide; agents see their own twin/performance. No auto-contact.
-- ============================================================================

-- 1) agent_intelligence_profiles (one per agent)
create table public.agent_intelligence_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  user_id                  uuid not null references public.users(id) on delete cascade,
  agent_score              smallint not null default 0,
  territory_score          smallint not null default 0,
  conversion_score         smallint not null default 0,
  responsiveness_score     smallint not null default 0,
  expertise_score          smallint not null default 0,
  customer_score           smallint not null default 0,
  workload_score           smallint not null default 0,
  momentum_score           smallint not null default 0,
  satisfaction_score       smallint not null default 0,
  reliability_score        smallint not null default 0,
  active_leads             integer not null default 0,
  active_buyers            integer not null default 0,
  active_sellers           integer not null default 0,
  active_properties        integer not null default 0,
  active_matches           integer not null default 0,
  total_closed_deals       integer not null default 0,
  total_revenue            bigint not null default 0,
  avg_response_minutes     integer,
  avg_days_to_close        integer,
  primary_localities       jsonb not null default '[]'::jsonb,
  primary_property_types   jsonb not null default '[]'::jsonb,
  primary_deal_types       jsonb not null default '[]'::jsonb,
  strengths                jsonb not null default '[]'::jsonb,
  weaknesses               jsonb not null default '[]'::jsonb,
  next_best_growth_area    text,
  ai_summary               text,
  ai_growth_advice         text,
  last_calculated_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint agent_intel_profiles_uniq unique (organization_id, user_id)
);
create index agent_intel_profiles_org_idx  on public.agent_intelligence_profiles(organization_id);
create index agent_intel_profiles_user_idx  on public.agent_intelligence_profiles(user_id);

-- 2) agent_locality_performance
create table public.agent_locality_performance (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  locality           text not null,
  leads_count        integer not null default 0,
  meetings_count     integer not null default 0,
  deals_count        integer not null default 0,
  revenue            bigint not null default 0,
  avg_days_to_close  integer,
  conversion_rate    numeric(5,2) not null default 0,
  satisfaction_rate  numeric(5,2) not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index agent_locality_perf_org_idx   on public.agent_locality_performance(organization_id);
create index agent_locality_perf_user_idx   on public.agent_locality_performance(user_id);
create index agent_locality_perf_loc_idx     on public.agent_locality_performance(locality);

-- 3) agent_property_type_performance
create table public.agent_property_type_performance (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  property_type      text not null,
  leads_count        integer not null default 0,
  deals_count        integer not null default 0,
  conversion_rate    numeric(5,2) not null default 0,
  avg_days_to_close  integer,
  revenue            bigint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index agent_proptype_perf_org_idx   on public.agent_property_type_performance(organization_id);
create index agent_proptype_perf_user_idx   on public.agent_property_type_performance(user_id);

-- 4) lead_routing_profiles (one per routing decision)
create table public.lead_routing_profiles (
  id                              uuid primary key default gen_random_uuid(),
  organization_id                 uuid not null references public.organizations(id) on delete cascade,
  lead_id                         uuid not null references public.leads(id) on delete cascade,
  recommended_agent_id            uuid references public.users(id) on delete set null,
  assigned_agent_id               uuid references public.users(id) on delete set null,
  routing_score                   smallint not null default 0,
  confidence_score                smallint not null default 0,
  expected_conversion_probability smallint not null default 0,
  expected_days_to_close          integer,
  expected_revenue                bigint,
  routing_reason                  text,
  routing_factors                 jsonb not null default '{}'::jsonb,
  ai_routing_reason               text,
  status                          text not null default 'pending',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint lead_routing_profiles_uniq unique (organization_id, lead_id)
);
create index lead_routing_profiles_org_idx   on public.lead_routing_profiles(organization_id);
create index lead_routing_profiles_lead_idx   on public.lead_routing_profiles(lead_id);
create index lead_routing_profiles_status_idx  on public.lead_routing_profiles(status);

-- 5) lead_routing_candidates (ranked agents per decision)
create table public.lead_routing_candidates (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  routing_profile_id  uuid not null references public.lead_routing_profiles(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  rank                integer not null default 0,
  score               smallint not null default 0,
  probability         smallint not null default 0,
  reason              text,
  created_at          timestamptz not null default now()
);
create index lead_routing_candidates_org_idx     on public.lead_routing_candidates(organization_id);
create index lead_routing_candidates_profile_idx  on public.lead_routing_candidates(routing_profile_id);

-- updated_at triggers
create trigger trg_agent_intel_profiles_updated before update on public.agent_intelligence_profiles
  for each row execute function public.set_updated_at();
create trigger trg_agent_locality_perf_updated before update on public.agent_locality_performance
  for each row execute function public.set_updated_at();
create trigger trg_agent_proptype_perf_updated before update on public.agent_property_type_performance
  for each row execute function public.set_updated_at();
create trigger trg_lead_routing_profiles_updated before update on public.lead_routing_profiles
  for each row execute function public.set_updated_at();

-- RLS. Insert/update/delete = manager+ (the routing engine + manager actions).
-- Select: managers see office-wide; agents see their own rows (user_id = auth.uid()).
do $$
declare t text;
  own_tbls text[] := array['agent_intelligence_profiles','agent_locality_performance','agent_property_type_performance'];
begin
  foreach t in array own_tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id() and (public.has_min_role(''manager'') or user_id = auth.uid()));', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager'')) with check (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

-- Routing tables: managers full; agents may see decisions where they are
-- recommended or assigned.
alter table public.lead_routing_profiles enable row level security;
create policy "lead_routing_profiles_select" on public.lead_routing_profiles for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or recommended_agent_id = auth.uid() or assigned_agent_id = auth.uid()));
create policy "lead_routing_profiles_write" on public.lead_routing_profiles for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager')) with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

alter table public.lead_routing_candidates enable row level security;
create policy "lead_routing_candidates_select" on public.lead_routing_candidates for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or user_id = auth.uid()));
create policy "lead_routing_candidates_write" on public.lead_routing_candidates for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager')) with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

grant select, insert, update, delete on
  public.agent_intelligence_profiles, public.agent_locality_performance, public.agent_property_type_performance,
  public.lead_routing_profiles, public.lead_routing_candidates to authenticated;
grant all privileges on
  public.agent_intelligence_profiles, public.agent_locality_performance, public.agent_property_type_performance,
  public.lead_routing_profiles, public.lead_routing_candidates to service_role;
