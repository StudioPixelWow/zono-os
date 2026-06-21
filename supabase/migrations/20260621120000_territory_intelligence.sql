-- ============================================================================
-- ZONO — Territory Intelligence OS (strategic "where to work" layer)
-- ----------------------------------------------------------------------------
-- Deterministic, explainable territory analytics consuming the existing brains
-- (transactions, geo, recommendations, competitors, acquisition, routing, team,
-- revenue, forecast). No LLM, no auto-contact/assignment/publishing. Org column
-- convention here is `organization_id`. Idempotent: safe to re-run.
-- ============================================================================

-- 1) territory_profiles — one per city / neighborhood / street / building cluster
create table if not exists public.territory_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  territory_type           text not null,
  territory_key            text not null,             -- stable natural key (e.g. "city|neighborhood")
  city_name                text,
  neighborhood_name        text,
  street                   text,
  -- Scores (0-100)
  demand_score             numeric not null default 0,
  supply_score             numeric not null default 0,
  acquisition_score        numeric not null default 0,
  revenue_score            numeric not null default 0,
  forecast_score           numeric not null default 0,
  competition_score        numeric not null default 0,
  dominance_score          numeric not null default 0,
  penetration_score        numeric not null default 0,
  opportunity_score        numeric not null default 0,
  growth_score             numeric not null default 0,
  white_space_score        numeric not null default 0,
  territory_health_score   numeric not null default 0,
  territory_level          text not null default 'watch',
  -- Metrics
  active_buyers            integer not null default 0,
  active_sellers           integer not null default 0,
  active_properties        integer not null default 0,
  active_deals             integer not null default 0,
  active_matches           integer not null default 0,
  external_inventory       integer not null default 0,
  internal_inventory       integer not null default 0,
  transaction_volume_90d   integer not null default 0,
  transaction_volume_365d  integer not null default 0,
  avg_price                numeric,
  avg_price_sqm            numeric,
  expected_revenue         numeric not null default 0,
  expected_commission      numeric not null default 0,
  competitor_count         integer not null default 0,
  dominant_competitor_id   uuid,
  assigned_agents_count    integer not null default 0,
  recommendation_count     integer not null default 0,
  confidence_score         numeric not null default 0,
  summary_hebrew           text,
  metadata                 jsonb not null default '{}'::jsonb,
  last_calculated_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint territory_profiles_type_chk check (territory_type in ('city','neighborhood','street','building_cluster')),
  constraint territory_profiles_level_chk check (territory_level in ('critical','weak','watch','strong','dominant')),
  constraint territory_profiles_uniq unique (organization_id, territory_type, territory_key)
);

-- 2) territory_signals
create table if not exists public.territory_signals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  territory_profile_id uuid references public.territory_profiles(id) on delete cascade,
  signal_type         text not null,
  score               numeric not null default 0,
  confidence_score    numeric not null default 0,
  title               text not null,
  reason              text,
  recommended_action  text,
  status              text not null default 'open',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint territory_signals_type_chk check (signal_type in (
    'white_space','competitor_dominance','growth_area','acquisition_hotspot','inventory_gap',
    'buyer_cluster','seller_cluster','transaction_spike','revenue_opportunity','territory_decline',
    'agent_gap','office_gap','recommendation_density','market_shift'
  ))
);

-- 3) territory_assignments — agents/offices ↔ territories
create table if not exists public.territory_assignments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  territory_profile_id uuid not null references public.territory_profiles(id) on delete cascade,
  user_id             uuid references public.users(id) on delete cascade,
  role                text,
  priority            integer not null default 0,
  ownership_level     text not null default 'none',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint territory_assignments_ownership_chk check (ownership_level in ('none','weak','active','strong','dominant'))
);

-- 4) territory_snapshots — daily trend store
create table if not exists public.territory_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  territory_profile_id uuid references public.territory_profiles(id) on delete cascade,
  territory_type      text,
  territory_key       text,
  scores              jsonb not null default '{}'::jsonb,
  metrics             jsonb not null default '{}'::jsonb,
  snapshot_date       date not null default current_date,
  created_at          timestamptz not null default now()
);

-- 5) territory_dna_profiles (Part 3)
create table if not exists public.territory_dna_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  territory_profile_id     uuid not null references public.territory_profiles(id) on delete cascade,
  strongest_property_type  text,
  strongest_buyer_type     text,
  transaction_velocity     numeric not null default 0,
  inventory_balance        numeric not null default 0,
  buyer_demand             numeric not null default 0,
  seller_activity          numeric not null default 0,
  acquisition_potential    numeric not null default 0,
  revenue_potential        numeric not null default 0,
  recommendation_density   numeric not null default 0,
  dominant_competitor_id   uuid,
  dna_summary_hebrew       text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint territory_dna_uniq unique (organization_id, territory_profile_id)
);

-- 6) street_territory_profiles (Part 6 — Street Intelligence 2.0)
create table if not exists public.street_territory_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  city_name                text,
  neighborhood_name        text,
  street                   text not null,
  transaction_trend        numeric not null default 0,
  buyer_trend              numeric not null default 0,
  seller_trend             numeric not null default 0,
  acquisition_opportunity  numeric not null default 0,
  competitor_pressure      numeric not null default 0,
  office_penetration       numeric not null default 0,
  revenue_opportunity      numeric not null default 0,
  transaction_count_365d   integer not null default 0,
  avg_price_sqm            numeric,
  confidence_score         numeric not null default 0,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint street_territory_uniq unique (organization_id, city_name, street)
);

-- 7) building_cluster_profiles (Part 8)
create table if not exists public.building_cluster_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  city_name                text,
  neighborhood_name        text,
  street                   text,
  cluster_key              text not null,
  turnover_score           numeric not null default 0,
  investor_score           numeric not null default 0,
  acquisition_score        numeric not null default 0,
  activity_score           numeric not null default 0,
  transaction_count        integer not null default 0,
  avg_price_sqm            numeric,
  confidence_score         numeric not null default 0,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint building_cluster_uniq unique (organization_id, cluster_key)
);

-- Indexes --------------------------------------------------------------------
create index if not exists terr_prof_org_idx        on public.territory_profiles(organization_id);
create index if not exists terr_prof_type_idx       on public.territory_profiles(territory_type);
create index if not exists terr_prof_level_idx      on public.territory_profiles(territory_level);
create index if not exists terr_prof_opp_idx        on public.territory_profiles(opportunity_score desc);
create index if not exists terr_prof_rev_idx        on public.territory_profiles(revenue_score desc);
create index if not exists terr_sig_org_idx         on public.territory_signals(organization_id);
create index if not exists terr_sig_prof_idx        on public.territory_signals(territory_profile_id);
create index if not exists terr_sig_type_idx        on public.territory_signals(signal_type);
create index if not exists terr_assign_org_idx      on public.territory_assignments(organization_id);
create index if not exists terr_assign_prof_idx     on public.territory_assignments(territory_profile_id);
create index if not exists terr_assign_user_idx     on public.territory_assignments(user_id);
create index if not exists terr_snap_org_idx        on public.territory_snapshots(organization_id);
create index if not exists terr_snap_prof_idx       on public.territory_snapshots(territory_profile_id);
create index if not exists terr_dna_org_idx         on public.territory_dna_profiles(organization_id);
create index if not exists street_terr_org_idx      on public.street_territory_profiles(organization_id);
create index if not exists street_terr_city_idx     on public.street_territory_profiles(city_name);
create index if not exists bld_cluster_org_idx      on public.building_cluster_profiles(organization_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array['territory_profiles','territory_signals','territory_assignments','territory_dna_profiles','street_territory_profiles','building_cluster_profiles'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — org-scoped read for members; agent+ write (rows are system-generated) -
do $$
declare t text;
  tbls text[] := array[
    'territory_profiles','territory_signals','territory_assignments','territory_snapshots',
    'territory_dna_profiles','street_territory_profiles','building_cluster_profiles'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.territory_profiles, public.territory_signals, public.territory_assignments, public.territory_snapshots,
  public.territory_dna_profiles, public.street_territory_profiles, public.building_cluster_profiles
  to authenticated;
grant all privileges on
  public.territory_profiles, public.territory_signals, public.territory_assignments, public.territory_snapshots,
  public.territory_dna_profiles, public.street_territory_profiles, public.building_cluster_profiles
  to service_role;
