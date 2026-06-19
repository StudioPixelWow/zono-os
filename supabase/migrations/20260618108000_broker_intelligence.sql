-- ============================================================================
-- ZONO — 0025 · Broker Intelligence & Broker Detection Layer
-- ----------------------------------------------------------------------------
-- Public, lawful, business information only. Org-scoped. Deterministic-first
-- matching of external/CRM listings to broker profiles + human review queue.
-- No scraping here; discovery_runs is provider-ready architecture only.
-- ============================================================================

-- Enums (guarded for idempotent replay)
do $$ begin
  create type broker_type as enum ('independent_broker','agency','office','team','unknown');
exception when duplicate_object then null; end $$;
do $$ begin
  create type verification_status as enum ('unverified','auto','human_verified','rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type alias_type as enum ('name','agency_name','phone','email','website','social','nickname');
exception when duplicate_object then null; end $$;
do $$ begin
  create type broker_match_type as enum ('exact_phone','normalized_phone','exact_name','alias','agency_name','website','semantic','service_area','repeated_listing');
exception when duplicate_object then null; end $$;
do $$ begin
  create type broker_review_status as enum ('pending','approved','rejected','merged');
exception when duplicate_object then null; end $$;
do $$ begin
  create type listing_source_type as enum ('private_seller','broker','agency','office','exclusive','unknown');
exception when duplicate_object then null; end $$;

-- 1) broker_profiles
create table public.broker_profiles (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  display_name         text not null,
  normalized_name      text not null,
  broker_type          broker_type not null default 'unknown',
  agency_name          text,
  normalized_agency    text,
  phone                text,
  normalized_phone     text,
  email                text,
  website              text,
  license_number       text,
  primary_city         text,
  verification_status  verification_status not null default 'unverified',
  confidence_score     smallint not null default 0,
  listings_count       integer not null default 0,
  ai_summary           text,
  metadata             jsonb not null default '{}'::jsonb,
  created_by_user_id   uuid references public.users(id) on delete set null,
  verified_by_user_id  uuid references public.users(id) on delete set null,
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index broker_profiles_org_idx        on public.broker_profiles(org_id);
create index broker_profiles_phone_idx        on public.broker_profiles(normalized_phone);
create index broker_profiles_name_idx         on public.broker_profiles(normalized_name);
create index broker_profiles_city_idx         on public.broker_profiles(primary_city);

-- 2) broker_aliases
create table public.broker_aliases (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  broker_id         uuid not null references public.broker_profiles(id) on delete cascade,
  alias_type        alias_type not null,
  value             text not null,
  normalized_value  text not null,
  source            text,
  created_at        timestamptz not null default now()
);
create index broker_aliases_org_idx     on public.broker_aliases(org_id);
create index broker_aliases_broker_idx   on public.broker_aliases(broker_id);
create index broker_aliases_norm_idx     on public.broker_aliases(normalized_value);

-- 3) broker_sources (evidence)
create table public.broker_sources (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  broker_id    uuid not null references public.broker_profiles(id) on delete cascade,
  source_type  text not null,
  url          text,
  evidence     jsonb not null default '{}'::jsonb,
  captured_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index broker_sources_org_idx     on public.broker_sources(org_id);
create index broker_sources_broker_idx   on public.broker_sources(broker_id);

-- 4) broker_service_areas
create table public.broker_service_areas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  broker_id    uuid not null references public.broker_profiles(id) on delete cascade,
  locality_id  uuid references public.israel_localities(id) on delete set null,
  city_name    text not null,
  created_at   timestamptz not null default now()
);
create index broker_service_areas_org_idx     on public.broker_service_areas(org_id);
create index broker_service_areas_broker_idx   on public.broker_service_areas(broker_id);

-- 5) broker_discovery_runs (provider-ready; no scraping yet)
create table public.broker_discovery_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  provider      text not null,
  status        text not null default 'pending',
  params        jsonb not null default '{}'::jsonb,
  found_count   integer not null default 0,
  created_count integer not null default 0,
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index broker_discovery_runs_org_idx on public.broker_discovery_runs(org_id);

-- 6) broker_match_reviews (uncertain matches queue)
create table public.broker_match_reviews (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  listing_id        uuid references public.external_listings(id) on delete cascade,
  broker_id         uuid references public.broker_profiles(id) on delete set null,
  match_type        broker_match_type,
  confidence_score  smallint not null default 0,
  evidence          jsonb not null default '{}'::jsonb,
  status            broker_review_status not null default 'pending',
  decided_by        uuid references public.users(id) on delete set null,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index broker_match_reviews_org_idx     on public.broker_match_reviews(org_id);
create index broker_match_reviews_status_idx    on public.broker_match_reviews(status);
create index broker_match_reviews_listing_idx   on public.broker_match_reviews(listing_id);

-- 7) property_broker_matches (broker ↔ listing/property links)
create table public.property_broker_matches (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  external_listing_id  uuid references public.external_listings(id) on delete cascade,
  property_id          uuid references public.properties(id) on delete cascade,
  broker_id            uuid not null references public.broker_profiles(id) on delete cascade,
  match_type           broker_match_type,
  confidence_score     smallint not null default 0,
  status               broker_review_status not null default 'pending',
  evidence             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index property_broker_matches_org_idx       on public.property_broker_matches(org_id);
create index property_broker_matches_broker_idx      on public.property_broker_matches(broker_id);
create index property_broker_matches_listing_idx     on public.property_broker_matches(external_listing_id);

-- Extend external_listings with broker detection fields (non-breaking, nullable)
alter table public.external_listings
  add column if not exists listing_source_type     listing_source_type not null default 'unknown',
  add column if not exists broker_detection_badge   text,
  add column if not exists broker_confidence_score  smallint not null default 0,
  add column if not exists detected_broker_id       uuid references public.broker_profiles(id) on delete set null,
  add column if not exists detected_broker_name     text,
  add column if not exists broker_match_status      text not null default 'unmatched',
  add column if not exists broker_evidence          jsonb not null default '{}'::jsonb,
  add column if not exists broker_detected_at        timestamptz;

-- updated_at triggers
create trigger trg_broker_profiles_updated before update on public.broker_profiles
  for each row execute function public.set_updated_at();
create trigger trg_broker_match_reviews_updated before update on public.broker_match_reviews
  for each row execute function public.set_updated_at();
create trigger trg_property_broker_matches_updated before update on public.property_broker_matches
  for each row execute function public.set_updated_at();

-- RLS — org-scoped for all broker tables
do $$
declare t text;
  tbls text[] := array[
    'broker_profiles','broker_aliases','broker_sources','broker_service_areas',
    'broker_discovery_runs','broker_match_reviews','property_broker_matches'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.broker_profiles, public.broker_aliases, public.broker_sources, public.broker_service_areas,
  public.broker_discovery_runs, public.broker_match_reviews, public.property_broker_matches
  to authenticated;
grant all privileges on
  public.broker_profiles, public.broker_aliases, public.broker_sources, public.broker_service_areas,
  public.broker_discovery_runs, public.broker_match_reviews, public.property_broker_matches
  to service_role;
