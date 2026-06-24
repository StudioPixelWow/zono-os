-- ============================================================================
-- ZONO — Geocoding columns (Phase 24, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Real-maps infrastructure. Adds nullable coordinate + geocode-metadata columns
-- ONLY where maps need them. No data is invented: columns stay NULL until a real
-- geocode (or manual pin) fills them. Safe to run on any DB state.
--
--   • properties / property_transactions ALREADY have lat/lng (latitude/longitude,
--     lat/lng) — we only add geocode metadata.
--   • external_listings has address text only — add lat/lng + metadata so it can
--     be geocoded (admin batch action) before appearing on a map.
-- ============================================================================

-- ── properties: already has latitude/longitude + formatted_address. Add metadata.
alter table public.properties
  add column if not exists geocoded_at        timestamptz,
  add column if not exists geocode_provider   text,
  add column if not exists geocode_confidence numeric;

-- ── property_transactions: already has lat/lng. Add formatted address + metadata.
alter table public.property_transactions
  add column if not exists formatted_address  text,
  add column if not exists geocoded_at        timestamptz,
  add column if not exists geocode_provider   text,
  add column if not exists geocode_confidence numeric;

-- ── external_listings: address text only → add coordinates + metadata.
alter table public.external_listings
  add column if not exists lat                numeric,
  add column if not exists lng                numeric,
  add column if not exists formatted_address  text,
  add column if not exists geocoded_at        timestamptz,
  add column if not exists geocode_provider   text,
  add column if not exists geocode_confidence numeric;

-- Lookup helper for "rows still missing coordinates" (admin batch geocoding).
create index if not exists external_listings_geocode_idx
  on public.external_listings(org_id) where lat is null;
create index if not exists property_transactions_geocode_idx
  on public.property_transactions(organization_id) where lat is null;
