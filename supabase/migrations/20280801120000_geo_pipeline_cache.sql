-- ============================================================================
-- ZONO GEO — Automatic fast geocoding pipeline foundation.
-- ----------------------------------------------------------------------------
-- Adds the persistence the internal-first enrichment pipeline needs so we stop
-- paying for repeated provider calls:
--   1. geocoding_cache  — ONE canonical, org-independent coordinate per normalized
--      location key (exact / street / neighborhood / city). A lower-resolution
--      result may NEVER overwrite a higher-resolution one (enforced in code via
--      shouldReplaceCoordinate; the row also records its resolution honestly).
--   2. geocoding_runs   — bounded run metrics (cache hits, internal matches,
--      provider calls, skipped/failed) so ops can see cost + "last successful run".
--   3. lifecycle triggers — a new property/transaction starts geocode_status
--      'pending'; changing its address invalidates the stale coordinate → 'pending'
--      (a pipeline coordinate write, which does not touch the address, is left
--      alone, so we never re-geocode an unchanged address).
-- Both new tables are service-role only (RLS on, no anon/broker policy): they hold
-- operational geo data, never exposed to brokers.
-- ============================================================================

-- 1. Canonical geocoding cache -------------------------------------------------
create table if not exists public.geocoding_cache (
  id                uuid primary key default gen_random_uuid(),
  cache_key         text not null unique,                 -- e.g. 'street:קרית ביאליק|לוטם'
  key_type          text not null check (key_type in ('exact','street','neighborhood','city')),
  city              text,
  street            text,
  street_number     text,
  neighborhood      text,
  lat               numeric not null,
  lng               numeric not null,
  resolution        text not null check (resolution in ('ROOFTOP','STREET','NEIGHBORHOOD','CITY')),
  provider          text not null,                        -- google | nominatim | internal_listing | internal_transaction | internal_cache
  formatted_address text,
  confidence        numeric,
  hit_count         integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists geocoding_cache_key_type_idx on public.geocoding_cache(key_type);
alter table public.geocoding_cache enable row level security;
-- No anon/authenticated policy on purpose → only the service role (pipeline/ops)
-- can read or write it. Brokers never see raw cache rows.

-- 2. Pipeline run metrics ------------------------------------------------------
create table if not exists public.geocoding_runs (
  id                    uuid primary key default gen_random_uuid(),
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  ok                    boolean not null default false,
  orgs                  integer not null default 0,
  rows_considered       integer not null default 0,
  cache_hits            integer not null default 0,
  internal_exact        integer not null default 0,
  internal_street       integer not null default 0,
  internal_neighborhood integer not null default 0,
  google_calls          integer not null default 0,
  osm_calls             integer not null default 0,
  resolved              integer not null default 0,
  skipped               integer not null default 0,
  failed                integer not null default 0,
  detail                jsonb
);
create index if not exists geocoding_runs_started_idx on public.geocoding_runs(started_at desc);
alter table public.geocoding_runs enable row level security;

-- 3. Property lifecycle: pending-on-create, invalidate-on-address-change --------
create or replace function public.geo_properties_lifecycle()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.latitude is null and new.geocode_status is null then
      new.geocode_status := 'pending';
    end if;
    return new;
  end if;
  -- UPDATE: the address changed AND this update is not itself writing coordinates
  -- (the pipeline writes lat/lng and leaves the address columns untouched, so its
  -- writes never trip this). Invalidate the stale coordinate → re-geocode later.
  if (new.city is distinct from old.city
       or new.neighborhood is distinct from old.neighborhood
       or new.building_number is distinct from old.building_number)
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    new.latitude          := null;
    new.longitude         := null;
    new.geocode_resolution := null;
    new.geocode_provider  := null;
    new.geocode_confidence := null;
    new.geocoded_at       := null;
    new.geocode_error     := null;
    new.geocode_status    := 'pending';
  end if;
  return new;
end
$$;

drop trigger if exists geo_properties_lifecycle on public.properties;
create trigger geo_properties_lifecycle
  before insert or update on public.properties
  for each row execute function public.geo_properties_lifecycle();

-- 4. Transaction lifecycle: same contract (address-driven invalidation) ---------
create or replace function public.geo_transactions_lifecycle()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.lat is null and new.geocode_status is null then
      new.geocode_status := 'pending';
    end if;
    return new;
  end if;
  if (new.city_name is distinct from old.city_name
       or new.neighborhood_name is distinct from old.neighborhood_name
       or new.street is distinct from old.street
       or new.street_number is distinct from old.street_number
       or new.address is distinct from old.address)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    new.lat               := null;
    new.lng               := null;
    new.geocode_resolution := null;
    new.geocode_provider  := null;
    new.geocode_confidence := null;
    new.geocoded_at       := null;
    new.geocode_error     := null;
    new.geocode_status    := 'pending';
  end if;
  return new;
end
$$;

drop trigger if exists geo_transactions_lifecycle on public.property_transactions;
create trigger geo_transactions_lifecycle
  before insert or update on public.property_transactions
  for each row execute function public.geo_transactions_lifecycle();
