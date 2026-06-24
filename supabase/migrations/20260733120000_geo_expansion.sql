-- ============================================================================
-- ZONO — Geo Data Expansion (Phase 25.2, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Makes every map-capable entity geo-capable. NOTHING here invents coordinates —
-- it only creates nullable columns/tables that a real geocoder (Phase 24 service)
-- or import fills, with provider + confidence so every point is traceable.
--
-- Already geo-capable (Phase 24): properties (latitude/longitude+meta),
-- property_transactions (lat/lng+meta), external_listings (lat/lng+meta),
-- israel_localities (latitude/longitude), israel_neighborhoods (lat/lng).
-- This migration adds: neighborhoods centroids, buyer_geo_profiles,
-- seller_geo_profiles, territory_centroids. RLS + org isolation throughout.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── neighborhoods (AI-enrichment table): add centroid + geocode metadata ─────
alter table public.neighborhoods
  add column if not exists centroid_lat       numeric,
  add column if not exists centroid_lng       numeric,
  add column if not exists geocoded_at        timestamptz,
  add column if not exists geocode_provider   text,
  add column if not exists geocode_confidence numeric;

-- ── market_area_snapshots: optional locality-center cache (filled from join) ──
alter table public.market_area_snapshots
  add column if not exists centroid_lat numeric,
  add column if not exists centroid_lng numeric;

-- ── buyer_geo_profiles — geographic demand profile per buyer ─────────────────
create table if not exists public.buyer_geo_profiles (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  buyer_id                uuid not null references public.buyers(id) on delete cascade,
  preferred_cities        text[] not null default '{}',
  preferred_neighborhoods text[] not null default '{}',
  search_radius_m         integer,
  centroid_lat            numeric,                 -- weighted center of preferred areas (geocoded)
  centroid_lng            numeric,
  coverage_polygon        jsonb,                   -- optional GeoJSON coverage (future)
  heat_score              numeric,                 -- demand intensity (0..100), real-derived
  geocoded_at             timestamptz,
  geocode_provider        text,
  geocode_confidence      numeric,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, buyer_id)
);
create index if not exists buyer_geo_profiles_org_idx on public.buyer_geo_profiles(org_id);
create index if not exists buyer_geo_profiles_geo_idx on public.buyer_geo_profiles(org_id) where centroid_lat is null;

-- ── seller_geo_profiles — geographic exposure per seller ─────────────────────
create table if not exists public.seller_geo_profiles (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  seller_id           uuid not null references public.sellers(id) on delete cascade,
  property_count      integer not null default 0,
  centroid_lat        numeric,                     -- center of the seller's property locations
  centroid_lng        numeric,
  exposure_radius_m   integer,                     -- market-exposure radius
  cluster             jsonb,                       -- ownership cluster points (from real properties)
  geocoded_at         timestamptz,
  geocode_provider    text,
  geocode_confidence  numeric,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, seller_id)
);
create index if not exists seller_geo_profiles_org_idx on public.seller_geo_profiles(org_id);

-- ── territory_centroids — geographic anchor for agent territories ────────────
create table if not exists public.territory_centroids (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  territory_id        uuid references public.territory_profiles(id) on delete cascade,
  name                text not null,
  centroid_lat        numeric,                     -- from neighborhood/locality centers (real)
  centroid_lng        numeric,
  coverage_radius_m   integer,
  polygon             jsonb,                       -- optional GeoJSON (future, OSM)
  source              text,                        -- 'neighborhood' | 'locality' | 'manual'
  geocode_confidence  numeric,
  geocoded_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, territory_id, name)
);
create index if not exists territory_centroids_org_idx on public.territory_centroids(org_id);

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists trg_buyer_geo_profiles_updated on public.buyer_geo_profiles;
create trigger trg_buyer_geo_profiles_updated before update on public.buyer_geo_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_seller_geo_profiles_updated on public.seller_geo_profiles;
create trigger trg_seller_geo_profiles_updated before update on public.seller_geo_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_territory_centroids_updated on public.territory_centroids;
create trigger trg_territory_centroids_updated before update on public.territory_centroids for each row execute function public.set_updated_at();

-- ── RLS — same-org read; agent+ write ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['buyer_geo_profiles','seller_geo_profiles','territory_centroids'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
