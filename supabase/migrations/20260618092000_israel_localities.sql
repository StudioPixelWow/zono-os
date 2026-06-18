-- ============================================================================
-- ZONO — 0011 · Israel localities reference table
-- ----------------------------------------------------------------------------
-- Canonical list of Israeli localities (ערים/יישובים), imported from the
-- official CBS / Ministry of Interior localities file via
-- scripts/import-israel-localities.ts. Reference data: readable by everyone,
-- written only by the import script (service-role). No neighborhoods yet.
-- ============================================================================

create extension if not exists pg_trgm;  -- fast Hebrew-name autocomplete

create table public.israel_localities (
  id                   uuid primary key default gen_random_uuid(),
  locality_code        text not null unique,
  name_he              text not null,
  name_en              text,
  locality_type        text,
  district             text,
  subdistrict          text,
  municipality_status  text,
  population            integer check (population is null or population >= 0),
  latitude             numeric,
  longitude            numeric,
  is_active            boolean not null default true,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- locality_code already has a unique (btree) index from the constraint above.
create index idx_israel_localities_name_he on public.israel_localities (name_he);
create index idx_israel_localities_district on public.israel_localities (district);
create index idx_israel_localities_is_active on public.israel_localities (is_active);
-- Trigram index for "search-as-you-type" by Hebrew name (ILIKE '%...%').
create index idx_israel_localities_name_he_trgm
  on public.israel_localities using gin (name_he gin_trgm_ops);

create trigger trg_israel_localities_updated_at
  before update on public.israel_localities
  for each row execute function public.set_updated_at();

-- ── RLS: public reference data ───────────────────────────────────────────────
alter table public.israel_localities enable row level security;

create policy "israel_localities_select" on public.israel_localities
  for select to authenticated, anon
  using (true);

grant select on public.israel_localities to authenticated, anon;
grant all privileges on public.israel_localities to service_role;
