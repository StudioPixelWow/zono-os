-- ============================================================================
-- ZONO — 0048 · AI Neighborhood Enrichment (research table + processing queue)
-- ----------------------------------------------------------------------------
-- `neighborhoods`: AI-researched neighborhoods per locality (national reference,
-- pending verification). `neighborhood_enrichment_cities`: the upload queue that
-- drives city-by-city processing, in CSV order, with resume/retry. Both written
-- by the service role from the enrichment service; readable by authenticated.
-- Idempotent.
-- ============================================================================

create table if not exists public.neighborhoods (
  id                 uuid primary key default gen_random_uuid(),
  city_code          text not null,
  city_name          text not null,
  neighborhood_name  text not null,
  normalized_name    text,
  confidence_score   numeric,
  confidence_level   text,
  source_type        text default 'ai_generated_research',
  status             text default 'pending_verification',
  raw_ai_response    jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint neighborhoods_city_norm_uniq unique (city_code, normalized_name)
);
create index if not exists neighborhoods_city_code_idx on public.neighborhoods(city_code);
create index if not exists neighborhoods_city_name_idx on public.neighborhoods(city_name);

drop trigger if exists trg_neighborhoods_updated on public.neighborhoods;
create trigger trg_neighborhoods_updated before update on public.neighborhoods
  for each row execute function public.set_updated_at();

-- Processing queue / progress (one row per uploaded locality, CSV order via row_index).
create table if not exists public.neighborhood_enrichment_cities (
  id                  uuid primary key default gen_random_uuid(),
  city_code           text not null,
  city_name           text not null,
  row_index           integer not null default 0,
  status              text not null default 'pending',   -- pending | done | empty | failed
  attempts            integer not null default 0,
  neighborhoods_count integer not null default 0,
  confidence_summary  text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint nec_city_code_uniq unique (city_code)
);
create index if not exists nec_status_idx on public.neighborhood_enrichment_cities(status, row_index);

drop trigger if exists trg_nec_updated on public.neighborhood_enrichment_cities;
create trigger trg_nec_updated before update on public.neighborhood_enrichment_cities
  for each row execute function public.set_updated_at();

-- RLS: national reference data — readable by any authenticated user; writes only
-- via the service role (the enrichment service).
alter table public.neighborhoods enable row level security;
drop policy if exists "neighborhoods_select" on public.neighborhoods;
create policy "neighborhoods_select" on public.neighborhoods for select to authenticated using (true);

alter table public.neighborhood_enrichment_cities enable row level security;
drop policy if exists "nec_select" on public.neighborhood_enrichment_cities;
create policy "nec_select" on public.neighborhood_enrichment_cities for select to authenticated using (true);

grant select on public.neighborhoods to authenticated;
grant select on public.neighborhood_enrichment_cities to authenticated;
grant all privileges on public.neighborhoods to service_role;
grant all privileges on public.neighborhood_enrichment_cities to service_role;
