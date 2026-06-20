-- ============================================================================
-- ZONO — 0040 · Transactions Intelligence OS  (חקר עסקאות באזור)
-- ----------------------------------------------------------------------------
-- Real official sold-price transactions (govmap_transactions via Apify) as a
-- core market-data layer: coverage targets, raw transactions (+full payload),
-- sync logs, property research reports, building & street intelligence, and an
-- opportunity radar. Deterministic. No LLM. No invented data. Org-scoped RLS;
-- read for all org members, write for agent+. Integrates additively with the
-- existing stack (does NOT modify Market/External/Acquisition/Forecast/etc).
-- Idempotent.
-- ============================================================================

-- 0) Agent market-coverage fields (only added if missing; existing operating_*
--    fields remain the primary source).
alter table public.users add column if not exists primary_city text;
alter table public.users add column if not exists primary_neighborhoods jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists market_coverage_enabled boolean not null default true;

-- 1) geo_coverage_targets — one Apify coverage pull area (city / neighborhood).
create table if not exists public.geo_coverage_targets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  city_name           text not null,
  city_name_he        text,
  locality_id         uuid references public.israel_localities(id) on delete set null,
  neighborhood_name   text,
  neighborhood_name_he text,
  lat                 numeric,
  lng                 numeric,
  radius_meters       integer not null default 700,
  priority            integer not null default 1,
  coverage_status     text not null default 'pending',  -- pending|ready|syncing|completed|failed|disabled|pending_neighborhoods
  last_sync_at        timestamptz,
  transactions_found  integer not null default 0,
  last_error          text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists geo_coverage_targets_uniq
  on public.geo_coverage_targets(organization_id, city_name, coalesce(neighborhood_name, ''), coalesce(lat, 0), coalesce(lng, 0));
create index if not exists geo_coverage_org_idx          on public.geo_coverage_targets(organization_id);
create index if not exists geo_coverage_city_idx         on public.geo_coverage_targets(city_name);
create index if not exists geo_coverage_neighborhood_idx on public.geo_coverage_targets(neighborhood_name);
create index if not exists geo_coverage_status_idx       on public.geo_coverage_targets(coverage_status);
create index if not exists geo_coverage_lastsync_idx     on public.geo_coverage_targets(last_sync_at);

-- 2) property_transactions — real sold transactions (+ full raw payload).
create table if not exists public.property_transactions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  source_platform     text not null default 'govmap_transactions',
  source_actor        text not null default 'Israel Real Estate Transactions - Official Sold Prices',
  source_run_id       text,
  asset_id            text,
  external_id         text,
  deal_date           date,
  deal_amount         numeric,
  price_per_sqm       numeric,
  address             text,
  normalized_address  text,
  city_name           text,
  neighborhood_name   text,
  street              text,
  street_number       text,
  lat                 numeric,
  lng                 numeric,
  rooms               numeric,
  floor               text,
  area                numeric,
  property_type       text,
  is_first_hand       boolean,
  gush                text,
  helka               text,
  tat_helka           text,
  raw_payload         jsonb not null default '{}'::jsonb,
  scraped_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Dedup: primary on asset_id, fallback on normalized address + deal facts.
create unique index if not exists property_transactions_asset_uniq
  on public.property_transactions(organization_id, source_platform, asset_id) where asset_id is not null;
create unique index if not exists property_transactions_fallback_uniq
  on public.property_transactions(organization_id, city_name, normalized_address, deal_date, deal_amount, area) where asset_id is null;
create index if not exists property_transactions_org_idx          on public.property_transactions(organization_id);
create index if not exists property_transactions_city_idx         on public.property_transactions(city_name);
create index if not exists property_transactions_neighborhood_idx on public.property_transactions(neighborhood_name);
create index if not exists property_transactions_street_idx       on public.property_transactions(street);
create index if not exists property_transactions_normaddr_idx     on public.property_transactions(normalized_address);
create index if not exists property_transactions_date_idx         on public.property_transactions(deal_date desc);

-- 3) transaction_sync_logs — one row per coverage-target sync run.
create table if not exists public.transaction_sync_logs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  agent_id            uuid references public.users(id) on delete set null,
  user_id             uuid references public.users(id) on delete set null,
  city_name           text,
  neighborhood_name   text,
  coverage_target_id  uuid references public.geo_coverage_targets(id) on delete set null,
  actor_name          text,
  actor_id            text,
  status              text not null default 'pending',  -- pending|running|completed|failed|partial
  started_at          timestamptz,
  finished_at         timestamptz,
  records_imported    integer not null default 0,
  duplicates_skipped  integer not null default 0,
  failed_records      integer not null default 0,
  total_records       integer not null default 0,
  error_message       text,
  raw_response        jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists transaction_sync_logs_org_idx    on public.transaction_sync_logs(organization_id);
create index if not exists transaction_sync_logs_target_idx on public.transaction_sync_logs(coverage_target_id);
create index if not exists transaction_sync_logs_created_idx on public.transaction_sync_logs(created_at desc);

-- 4) property_research_reports — comparable-transaction valuation per property.
create table if not exists public.property_research_reports (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  property_listing_id    uuid references public.properties(id) on delete set null,
  external_listing_id    uuid references public.external_listings(id) on delete set null,
  acquisition_profile_id uuid references public.inventory_acquisition_profiles(id) on delete set null,
  created_by             uuid references public.users(id) on delete set null,
  city_name              text,
  neighborhood_name      text,
  address                text,
  normalized_address     text,
  rooms                  numeric,
  area                   numeric,
  asking_price           numeric,
  asking_price_per_sqm   numeric,
  estimated_market_value numeric,
  avg_price_per_sqm      numeric,
  median_price_per_sqm   numeric,
  min_price_per_sqm      numeric,
  max_price_per_sqm      numeric,
  gap_from_market_percent numeric,
  comparable_transactions jsonb not null default '[]'::jsonb,
  confidence_score       numeric not null default 0,
  confidence_level       text not null default 'insufficient',  -- high|medium|low|insufficient
  explanation_hebrew     text,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists property_research_org_idx      on public.property_research_reports(organization_id);
create index if not exists property_research_property_idx on public.property_research_reports(property_listing_id);
create index if not exists property_research_external_idx on public.property_research_reports(external_listing_id);
create index if not exists property_research_acq_idx      on public.property_research_reports(acquisition_profile_id);

-- 5) building_intelligence — building-level aggregates from real transactions.
create table if not exists public.building_intelligence (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  city_name            text,
  street               text,
  house_number         text,
  normalized_address   text,
  transactions_count   integer not null default 0,
  last_transaction_date date,
  avg_price_per_sqm    numeric,
  median_price_per_sqm numeric,
  min_price_per_sqm    numeric,
  max_price_per_sqm    numeric,
  avg_deal_amount      numeric,
  price_trend_12m      numeric,
  price_trend_24m      numeric,
  confidence_score     numeric not null default 0,
  summary_hebrew       text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists building_intelligence_uniq
  on public.building_intelligence(organization_id, city_name, normalized_address);
create index if not exists building_intelligence_org_idx on public.building_intelligence(organization_id);

-- 6) street_intelligence — street-level aggregates from real transactions.
create table if not exists public.street_intelligence (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  city_name            text,
  street               text,
  transactions_count   integer not null default 0,
  avg_price_per_sqm    numeric,
  median_price_per_sqm numeric,
  min_price_per_sqm    numeric,
  max_price_per_sqm    numeric,
  avg_deal_amount      numeric,
  price_trend_6m       numeric,
  price_trend_12m      numeric,
  price_trend_24m      numeric,
  liquidity_score      numeric,
  street_score         numeric,
  confidence_score     numeric not null default 0,
  summary_hebrew       text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists street_intelligence_uniq
  on public.street_intelligence(organization_id, city_name, street);
create index if not exists street_intelligence_org_idx on public.street_intelligence(organization_id);

-- 7) transaction_opportunity_radar_alerts — below/above-market & hot-street alerts.
create table if not exists public.transaction_opportunity_radar_alerts (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  property_listing_id    uuid references public.properties(id) on delete set null,
  external_listing_id    uuid references public.external_listings(id) on delete set null,
  acquisition_profile_id uuid references public.inventory_acquisition_profiles(id) on delete set null,
  research_report_id     uuid references public.property_research_reports(id) on delete set null,
  city_name              text,
  neighborhood_name      text,
  address                text,
  asking_price           numeric,
  estimated_market_value numeric,
  gap_from_market_percent numeric,
  opportunity_score      numeric not null default 0,
  confidence_score       numeric not null default 0,
  opportunity_type       text not null default 'needs_review',  -- below_market|above_market|fair_market|price_drop|hot_street|needs_review|not_enough_data
  reason_hebrew          text,
  recommended_action_hebrew text,
  status                 text not null default 'new',  -- new|reviewing|sent_to_client|not_relevant|closed
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists txn_radar_org_idx    on public.transaction_opportunity_radar_alerts(organization_id);
create index if not exists txn_radar_status_idx  on public.transaction_opportunity_radar_alerts(status);
create index if not exists txn_radar_score_idx   on public.transaction_opportunity_radar_alerts(opportunity_score desc);
create index if not exists txn_radar_acq_idx     on public.transaction_opportunity_radar_alerts(acquisition_profile_id);

-- updated_at triggers (all but the append-only sync log).
do $$
declare t text;
  tbls text[] := array['geo_coverage_targets','property_transactions','property_research_reports','building_intelligence','street_intelligence','transaction_opportunity_radar_alerts'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — org-scoped: read for all org members, write for agent+.
do $$
declare t text;
  tbls text[] := array['geo_coverage_targets','property_transactions','transaction_sync_logs','property_research_reports','building_intelligence','street_intelligence','transaction_opportunity_radar_alerts'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.geo_coverage_targets, public.property_transactions, public.transaction_sync_logs,
  public.property_research_reports, public.building_intelligence, public.street_intelligence,
  public.transaction_opportunity_radar_alerts to authenticated;
grant all privileges on
  public.geo_coverage_targets, public.property_transactions, public.transaction_sync_logs,
  public.property_research_reports, public.building_intelligence, public.street_intelligence,
  public.transaction_opportunity_radar_alerts to service_role;
