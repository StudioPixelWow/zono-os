-- ============================================================================
-- ZONO — Geo Data Expansion v2 (Phase 25.2 full spec, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Builds on 20260733120000_geo_expansion.sql. Adds geocode status/error tracking,
-- neighborhood polygon columns, and the extra geo-profile fields from the full
-- spec. NOTHING invents coordinates — these are nullable columns a real geocoder
-- fills, with provider + confidence + status so every point is traceable.
-- Safe to run whether or not v1 ran (every change is IF NOT EXISTS).
-- ============================================================================

-- ── geocode status/error on the located entities (Phase 24 added lat/lng+meta) ─
do $$
declare t text;
begin
  foreach t in array array['properties','external_listings','property_transactions'] loop
    execute format('alter table public.%I add column if not exists geocode_status text;', t);   -- pending|geocoded|low_confidence|failed|manual
    execute format('alter table public.%I add column if not exists geocode_error text;', t);
  end loop;
end $$;

-- ── neighborhoods: centroid source + polygon (no fake polygons; nullable) ─────
alter table public.neighborhoods
  add column if not exists centroid_source text,
  add column if not exists polygon_geojson jsonb,
  add column if not exists polygon_source  text;

-- ── buyer_geo_profiles: spec fields (additive to v1 columns) ─────────────────
alter table public.buyer_geo_profiles
  add column if not exists preferred_localities jsonb not null default '[]'::jsonb,
  add column if not exists search_radius_km      numeric,
  add column if not exists geo_confidence        numeric,
  add column if not exists metadata              jsonb not null default '{}'::jsonb;

-- ── seller_geo_profiles: spec fields (per-property point variant) ────────────
alter table public.seller_geo_profiles
  add column if not exists property_id    uuid references public.properties(id) on delete set null,
  add column if not exists latitude       numeric,
  add column if not exists longitude      numeric,
  add column if not exists locality       text,
  add column if not exists neighborhood   text,
  add column if not exists geo_confidence numeric,
  add column if not exists metadata       jsonb not null default '{}'::jsonb;

-- ── territory_centroids (serves as territory_geo_profiles): spec fields ──────
alter table public.territory_centroids
  add column if not exists territory_type  text,
  add column if not exists polygon_geojson jsonb,
  add column if not exists geo_confidence  numeric,
  add column if not exists metadata        jsonb not null default '{}'::jsonb;

-- Lookup helpers for "failed / missing" geocode queues.
create index if not exists properties_geocode_status_idx            on public.properties(org_id, geocode_status);
create index if not exists external_listings_geocode_status_idx     on public.external_listings(org_id, geocode_status);
create index if not exists property_transactions_geocode_status_idx on public.property_transactions(organization_id, geocode_status);
