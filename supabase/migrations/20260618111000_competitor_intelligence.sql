-- ============================================================================
-- ZONO — 0028 · Competitor Intelligence OS
-- ----------------------------------------------------------------------------
-- Turns broker profiles + external listings + market snapshots into market
-- structure intelligence: who controls each locality, who's growing/declining,
-- and where to focus acquisition. Org-scoped. No scraping, public data only.
-- ============================================================================

-- 1) competitor_profiles (one per broker/agency competitor)
create table public.competitor_profiles (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  broker_profile_id         uuid references public.broker_profiles(id) on delete set null,
  display_name              text not null,
  competitor_type           text not null default 'unknown',
  market_share_score        smallint not null default 0,
  inventory_strength_score  smallint not null default 0,
  growth_score              smallint not null default 0,
  exclusivity_score         smallint not null default 0,
  pricing_power_score       smallint not null default 0,
  activity_score            smallint not null default 0,
  acquisition_risk_score    smallint not null default 0,
  opportunity_score         smallint not null default 0,
  total_listings            integer not null default 0,
  active_localities         integer not null default 0,
  dominant_localities       jsonb not null default '[]'::jsonb,
  first_seen_at             timestamptz,
  last_seen_at              timestamptz,
  ai_summary                text,
  ai_risk_summary           text,
  ai_opportunity_summary    text,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint competitor_profiles_uniq unique (organization_id, broker_profile_id)
);
create index competitor_profiles_org_idx    on public.competitor_profiles(organization_id);
create index competitor_profiles_broker_idx  on public.competitor_profiles(broker_profile_id);
create index competitor_profiles_score_idx    on public.competitor_profiles(market_share_score desc);

-- 2) competitor_market_positions (per locality)
create table public.competitor_market_positions (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  competitor_profile_id     uuid not null references public.competitor_profiles(id) on delete cascade,
  locality                  text not null,
  listings_count            integer not null default 0,
  market_share_percent      numeric(5,2) not null default 0,
  avg_price                 bigint,
  avg_price_per_sqm         integer,
  exclusives_count          integer not null default 0,
  private_seller_loss_count integer not null default 0,
  inventory_change_30d      integer not null default 0,
  growth_rate               numeric(6,2) not null default 0,
  rank                      integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index competitor_positions_org_idx        on public.competitor_market_positions(organization_id);
create index competitor_positions_competitor_idx  on public.competitor_market_positions(competitor_profile_id);
create index competitor_positions_locality_idx     on public.competitor_market_positions(locality);

-- 3) competitor_signals
create table public.competitor_signals (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  competitor_profile_id  uuid references public.competitor_profiles(id) on delete cascade,
  signal_type            text not null,
  locality               text,
  title                  text not null,
  description            text,
  severity               text not null default 'info',
  confidence_score       smallint not null default 60,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);
create index competitor_signals_org_idx     on public.competitor_signals(organization_id);
create index competitor_signals_type_idx     on public.competitor_signals(signal_type);

-- updated_at triggers
create trigger trg_competitor_profiles_updated before update on public.competitor_profiles
  for each row execute function public.set_updated_at();
create trigger trg_competitor_positions_updated before update on public.competitor_market_positions
  for each row execute function public.set_updated_at();

-- RLS — org-scoped
do $$
declare t text;
  tbls text[] := array['competitor_profiles','competitor_market_positions','competitor_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.competitor_profiles, public.competitor_market_positions, public.competitor_signals to authenticated;
grant all privileges on
  public.competitor_profiles, public.competitor_market_positions, public.competitor_signals to service_role;
