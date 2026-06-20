-- ============================================================================
-- ZONO — 0042 · Israel Neighborhoods (national geo reference)
-- ----------------------------------------------------------------------------
-- Nationwide, ORG-INDEPENDENT reference of neighborhoods per city (like
-- israel_localities for cities). Populated deterministically from official
-- sources (OpenStreetMap first), cached and SHARED across all organizations so
-- the geo layer + transaction scan work for every Israeli city, not one.
-- Readable by all authenticated users; written only by the service role
-- (lazy-cache + admin seed). Idempotent.
-- ============================================================================

create table if not exists public.israel_neighborhoods (
  id               uuid primary key default gen_random_uuid(),
  locality_code    text,                       -- → israel_localities.locality_code (optional)
  city_name        text not null,              -- canonical city key
  name_he          text not null,
  normalized_name  text not null,
  place_type       text,                       -- suburb | neighbourhood | quarter
  lat              numeric,
  lng              numeric,
  source           text not null default 'osm',
  confidence_score smallint not null default 0,
  is_verified      boolean not null default false,
  aliases          jsonb not null default '[]'::jsonb,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists israel_neighborhoods_uniq on public.israel_neighborhoods(city_name, normalized_name);
create index if not exists israel_neighborhoods_city_idx on public.israel_neighborhoods(city_name);
create index if not exists israel_neighborhoods_code_idx on public.israel_neighborhoods(locality_code);

drop trigger if exists trg_israel_neighborhoods_updated on public.israel_neighborhoods;
create trigger trg_israel_neighborhoods_updated before update on public.israel_neighborhoods
  for each row execute function public.set_updated_at();

-- RLS: national reference — readable by every authenticated user, writes only
-- via the service role (which bypasses RLS), so no authenticated write policy.
alter table public.israel_neighborhoods enable row level security;
drop policy if exists "israel_neighborhoods_select" on public.israel_neighborhoods;
create policy "israel_neighborhoods_select" on public.israel_neighborhoods for select to authenticated using (true);

grant select on public.israel_neighborhoods to authenticated;
grant all privileges on public.israel_neighborhoods to service_role;
