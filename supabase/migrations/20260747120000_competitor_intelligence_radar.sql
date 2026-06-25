-- ============================================================================
-- ZONO — Phase 17: Competitor Intelligence™ & Market Share Radar.
-- ----------------------------------------------------------------------------
-- Infers competitor (office/agency) activity ONLY from public/external market
-- listings already collected by Property Radar (market_property_sources +
-- market_property_events). NO new scraping. NO private CRM data. NO private
-- personal data. Market share is an ESTIMATE labeled as such — never official.
--
-- NOTE: an earlier broker-based "Competitor Intelligence OS" already owns the
-- tables competitor_profiles / competitor_market_positions / competitor_signals.
-- To avoid collision this Property-Radar-driven module is namespaced radar_*.
-- Additive + idempotent. RLS: org-scoped, no cross-org, service role writes.
-- ============================================================================

-- A. radar_competitor_profiles ------------------------------------------------
create table if not exists public.radar_competitor_profiles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  competitor_name text not null,
  normalized_name text not null,
  source          text default 'market_listing',
  confidence      int default 50,
  active          boolean default true,
  first_seen_at   timestamptz default now(),
  last_seen_at    timestamptz default now(),
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (org_id, normalized_name)
);
create index if not exists rcp_org_idx    on public.radar_competitor_profiles(org_id);
create index if not exists rcp_active_idx  on public.radar_competitor_profiles(org_id, active);

-- B. radar_competitor_listing_links -------------------------------------------
create table if not exists public.radar_competitor_listing_links (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  competitor_profile_id     uuid references public.radar_competitor_profiles(id) on delete cascade,
  market_property_source_id uuid references public.market_property_sources(id) on delete cascade,
  provider                  text,
  city                      text,
  neighborhood              text,
  property_type             text,
  listing_type              text,
  price                     numeric,
  rooms                     numeric,
  size_sqm                  numeric,
  first_seen_at             timestamptz default now(),
  last_seen_at              timestamptz default now(),
  status                    text default 'active',
  confidence                int default 50,
  evidence                  jsonb default '{}'::jsonb,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  unique (org_id, competitor_profile_id, market_property_source_id)
);
create index if not exists rcll_org_idx        on public.radar_competitor_listing_links(org_id);
create index if not exists rcll_competitor_idx  on public.radar_competitor_listing_links(competitor_profile_id);
create index if not exists rcll_source_idx       on public.radar_competitor_listing_links(market_property_source_id);
create index if not exists rcll_area_idx         on public.radar_competitor_listing_links(org_id, city, neighborhood);

-- C. radar_competitor_area_metrics --------------------------------------------
create table if not exists public.radar_competitor_area_metrics (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  competitor_profile_id   uuid references public.radar_competitor_profiles(id) on delete cascade,
  city                    text,
  neighborhood            text,
  period                  text,            -- daily / weekly / monthly
  period_start            date,
  period_end              date,
  active_listings         int default 0,
  new_listings            int default 0,
  price_drops             int default 0,
  removed_listings        int default 0,
  back_on_market          int default 0,
  avg_price               numeric,
  avg_days_on_market      numeric,
  estimated_share_percent numeric,
  trend                   text,            -- up / down / stable
  confidence              int default 50,
  metadata                jsonb default '{}'::jsonb,
  created_at              timestamptz default now(),
  unique (org_id, competitor_profile_id, city, neighborhood, period, period_start)
);
create index if not exists rcam_org_idx        on public.radar_competitor_area_metrics(org_id);
create index if not exists rcam_competitor_idx  on public.radar_competitor_area_metrics(competitor_profile_id);
create index if not exists rcam_area_idx         on public.radar_competitor_area_metrics(org_id, city, neighborhood);

-- D. radar_competitor_alerts --------------------------------------------------
create table if not exists public.radar_competitor_alerts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  competitor_profile_id uuid references public.radar_competitor_profiles(id) on delete set null,
  alert_type            text,  -- competitor_spike / competitor_price_drop_wave / competitor_new_area / market_share_change / aggressive_pricing
  severity              text,  -- low / medium / high / urgent
  title                 text,
  message               text,
  city                  text,
  neighborhood          text,
  status                text default 'unread',
  metadata              jsonb default '{}'::jsonb,
  created_at            timestamptz default now(),
  read_at               timestamptz
);
create index if not exists rca_org_idx     on public.radar_competitor_alerts(org_id);
create index if not exists rca_status_idx   on public.radar_competitor_alerts(org_id, status);
create index if not exists rca_dedup_idx     on public.radar_competitor_alerts(org_id, alert_type, competitor_profile_id, city, neighborhood, created_at);

drop trigger if exists trg_radar_competitor_profiles_updated on public.radar_competitor_profiles;
create trigger trg_radar_competitor_profiles_updated before update on public.radar_competitor_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_radar_competitor_links_updated on public.radar_competitor_listing_links;
create trigger trg_radar_competitor_links_updated before update on public.radar_competitor_listing_links for each row execute function public.set_updated_at();

-- RLS — org-scoped read for authenticated members; service role writes (snapshot job).
do $$
declare t text;
begin
  foreach t in array array['radar_competitor_profiles','radar_competitor_listing_links','radar_competitor_area_metrics','radar_competitor_alerts'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager')) with check (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
