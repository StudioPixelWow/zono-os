-- ============================================================================
-- ZONO Core Data — Brokerage Data (משרדי תיווך וסוכנים).
--
-- A deep, self-updating internal data layer of every brokerage office + agent
-- in Israel. This is a CORE DATA LAYER — every future external-listing scan runs
-- Broker Identity Resolution against it (identify agent → link office → enrich
-- contacts → record relationships). National/shared data (NOT org-scoped rows),
-- gated by an access model:
--   • zono_owner  → full national access + refresh/merge/resolve/export/sources
--   • brokerage_office / agent → READ ONLY, scoped to the org's allowed cities
-- Access is enforced in RLS (not just UI): even via a raw API call, a non-owner
-- can never read brokerage rows outside their allowed cities. Nothing is auto-
-- deleted; nothing overwrites existing data without a source, confidence and a
-- change-log row. Only public/business data is stored (Legal/Safe mode).
-- ============================================================================

-- ── organizations: access-model columns ────────────────────────────────────
alter table public.organizations add column if not exists role_type text not null default 'brokerage_office';
alter table public.organizations add column if not exists allowed_data_cities text[] not null default '{}'::text[];
alter table public.organizations add column if not exists allowed_data_regions text[] not null default '{}'::text[];

-- ── Access helpers (security definer) ───────────────────────────────────────
create or replace function public.is_zono_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role_type = 'zono_owner' from public.organizations where id = public.current_org_id()), false);
$$;

create or replace function public.brokerage_allowed_cities()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select allowed_data_cities from public.organizations where id = public.current_org_id()), '{}'::text[]);
$$;

-- True when a row's city is visible to the current user (owner = all).
create or replace function public.brokerage_city_visible(p_city text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_zono_owner() or (p_city is not null and p_city = any(public.brokerage_allowed_cities()));
$$;

-- ── 1) brokerage_offices ────────────────────────────────────────────────────
create table if not exists public.brokerage_offices (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  normalized_name      text,
  owner_name           text,
  manager_name         text,
  registration_number  text,
  brand_network        text,
  office_type          text default 'unknown',   -- independent | franchise | branch | unknown
  status               text default 'candidate',  -- active | unverified | candidate | inactive | not_found_recently | conflict
  city                 text,                       -- primary city (for scoping/filtering)
  primary_phone        text,
  primary_email        text,
  website_url          text,
  google_place_id      text,
  google_rating        numeric,
  google_reviews_count integer,
  confidence_score     numeric not null default 0,
  data_quality_score   numeric not null default 0,
  notes                text,
  metadata             jsonb not null default '{}'::jsonb,
  first_seen_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists bo_city_idx        on public.brokerage_offices (city);
create index if not exists bo_status_idx      on public.brokerage_offices (status);
create index if not exists bo_normname_idx    on public.brokerage_offices (normalized_name);
create index if not exists bo_phone_idx        on public.brokerage_offices (primary_phone);

-- ── 2) brokerage_office_locations ───────────────────────────────────────────
create table if not exists public.brokerage_office_locations (
  id               uuid primary key default gen_random_uuid(),
  office_id        uuid not null references public.brokerage_offices(id) on delete cascade,
  country          text default 'IL',
  city             text,
  neighborhood     text,
  street           text,
  house_number     text,
  full_address     text,
  lat              numeric,
  lng              numeric,
  source_id        uuid,
  confidence_score numeric not null default 0,
  status           text default 'unverified',
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);
create index if not exists bol_office_idx on public.brokerage_office_locations (office_id);
create index if not exists bol_city_idx   on public.brokerage_office_locations (city);

-- ── 3) brokerage_agents ─────────────────────────────────────────────────────
create table if not exists public.brokerage_agents (
  id                  uuid primary key default gen_random_uuid(),
  office_id           uuid references public.brokerage_offices(id) on delete set null,
  full_name           text not null,
  normalized_name     text,
  license_number      text,
  role_title          text,
  status              text default 'candidate',   -- verified | unverified | candidate | conflict | inactive
  city                text,
  primary_phone       text,
  primary_email       text,
  whatsapp_phone      text,
  specialties         text[] not null default '{}'::text[],
  confidence_score    numeric not null default 0,
  data_quality_score  numeric not null default 0,
  metadata            jsonb not null default '{}'::jsonb,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  last_verified_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists ba_office_idx   on public.brokerage_agents (office_id);
create index if not exists ba_city_idx     on public.brokerage_agents (city);
create index if not exists ba_status_idx   on public.brokerage_agents (status);
create index if not exists ba_normname_idx on public.brokerage_agents (normalized_name);
create index if not exists ba_phone_idx    on public.brokerage_agents (primary_phone);

-- ── 4) brokerage_contact_points ─────────────────────────────────────────────
create table if not exists public.brokerage_contact_points (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null,              -- office | agent
  entity_id        uuid not null,
  contact_type     text not null,              -- phone | email | whatsapp | website | facebook | instagram | linkedin
  value            text not null,
  normalized_value text,
  is_primary       boolean not null default false,
  status           text default 'unverified',  -- verified | unverified | conflict | inactive
  source_id        uuid,
  confidence_score numeric not null default 0,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_verified_at timestamptz
);
create index if not exists bcp_entity_idx on public.brokerage_contact_points (entity_type, entity_id);
create index if not exists bcp_norm_idx   on public.brokerage_contact_points (contact_type, normalized_value);

-- ── 5) brokerage_activity_areas ─────────────────────────────────────────────
create table if not exists public.brokerage_activity_areas (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null,              -- office | agent
  entity_id        uuid not null,
  city             text,
  neighborhood     text,
  street           text,
  confidence_score numeric not null default 0,
  source_id        uuid,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);
create index if not exists baa_entity_idx on public.brokerage_activity_areas (entity_type, entity_id);
create index if not exists baa_city_idx   on public.brokerage_activity_areas (city);

-- ── 6) brokerage_data_sources ───────────────────────────────────────────────
create table if not exists public.brokerage_data_sources (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  source_type       text not null,             -- google | yad2 | madlan | website | facebook | easy | b144 | manual | other
  base_url          text,
  is_active         boolean not null default true,
  reliability_score numeric not null default 50,
  last_run_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (source_type, name)
);

-- ── 7) brokerage_refresh_runs ───────────────────────────────────────────────
create table if not exists public.brokerage_refresh_runs (
  id               uuid primary key default gen_random_uuid(),
  run_type         text not null,              -- full_country | city | region | source | office | agent
  status           text not null default 'pending', -- pending | running | completed | failed | partial
  requested_by     uuid,
  parameters       jsonb not null default '{}'::jsonb,
  started_at       timestamptz,
  finished_at      timestamptz,
  offices_found    integer not null default 0,
  agents_found     integer not null default 0,
  new_offices      integer not null default 0,
  new_agents       integer not null default 0,
  updated_records  integer not null default 0,
  conflicts_created integer not null default 0,
  errors_count     integer not null default 0,
  log              jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists brr_created_idx on public.brokerage_refresh_runs (created_at desc);

-- ── 8) brokerage_change_log ─────────────────────────────────────────────────
create table if not exists public.brokerage_change_log (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null,
  entity_id        uuid not null,
  field_name       text,
  old_value        text,
  new_value        text,
  source_id        uuid,
  refresh_run_id   uuid references public.brokerage_refresh_runs(id) on delete set null,
  confidence_score numeric,
  change_type      text not null,             -- created | updated | enriched | conflict | merged | marked_inactive
  created_at       timestamptz not null default now()
);
create index if not exists bcl_entity_idx  on public.brokerage_change_log (entity_type, entity_id);
create index if not exists bcl_created_idx  on public.brokerage_change_log (created_at desc);

-- ── 9) brokerage_identity_matches ───────────────────────────────────────────
create table if not exists public.brokerage_identity_matches (
  id                 uuid primary key default gen_random_uuid(),
  match_type         text not null,           -- listing_to_agent | listing_to_office | agent_to_office | duplicate_agent | duplicate_office
  source_entity_type text not null,
  source_entity_id   text not null,
  target_entity_type text not null,
  target_entity_id   uuid,
  confidence_score   numeric not null default 0,
  match_reasons      jsonb not null default '[]'::jsonb,
  status             text not null default 'pending_review', -- auto_approved | pending_review | rejected | merged
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid
);
create index if not exists bim_status_idx on public.brokerage_identity_matches (status);

-- ── 10) brokerage_data_conflicts ────────────────────────────────────────────
create table if not exists public.brokerage_data_conflicts (
  id                uuid primary key default gen_random_uuid(),
  conflict_type     text not null,
  entity_a_type     text,
  entity_a_id       uuid,
  entity_b_type     text,
  entity_b_id       uuid,
  field_name        text,
  value_a           text,
  value_b           text,
  source_a_id       uuid,
  source_b_id       uuid,
  confidence_a      numeric,
  confidence_b      numeric,
  ai_recommendation text,
  status            text not null default 'open',  -- open | resolved | ignored
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid
);
create index if not exists bdc_status_idx on public.brokerage_data_conflicts (status);

-- ── 11) brokerage_external_listing_links ────────────────────────────────────
create table if not exists public.brokerage_external_listing_links (
  id                  uuid primary key default gen_random_uuid(),
  external_listing_id text not null,
  organization_id     uuid references public.organizations(id) on delete cascade,
  agent_id            uuid references public.brokerage_agents(id) on delete set null,
  office_id           uuid references public.brokerage_offices(id) on delete set null,
  city                text,
  matched_phone       text,
  matched_name        text,
  matched_source      text,
  confidence_score    numeric not null default 0,
  match_reasons       jsonb not null default '[]'::jsonb,
  status              text not null default 'auto_linked', -- auto_linked | pending_review | confirmed | rejected | candidate
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (external_listing_id, agent_id, office_id)
);
create index if not exists bell_listing_idx on public.brokerage_external_listing_links (external_listing_id);
create index if not exists bell_city_idx    on public.brokerage_external_listing_links (city);

-- ============================================================================
-- RLS — national/shared data with an owner-vs-city-scoped access model.
-- Reads: zono_owner sees all; brokerage_office/agent sees only allowed cities.
-- Writes: service-role only (server actions, gated by app-level role checks).
-- ============================================================================
alter table public.brokerage_offices              enable row level security;
alter table public.brokerage_office_locations     enable row level security;
alter table public.brokerage_agents               enable row level security;
alter table public.brokerage_contact_points       enable row level security;
alter table public.brokerage_activity_areas       enable row level security;
alter table public.brokerage_data_sources         enable row level security;
alter table public.brokerage_refresh_runs         enable row level security;
alter table public.brokerage_change_log           enable row level security;
alter table public.brokerage_identity_matches     enable row level security;
alter table public.brokerage_data_conflicts       enable row level security;
alter table public.brokerage_external_listing_links enable row level security;

-- City-scoped entity reads.
drop policy if exists bo_select on public.brokerage_offices;
create policy bo_select on public.brokerage_offices for select to authenticated
  using (public.brokerage_city_visible(city));

drop policy if exists ba_select on public.brokerage_agents;
create policy ba_select on public.brokerage_agents for select to authenticated
  using (public.brokerage_city_visible(city));

drop policy if exists bol_select on public.brokerage_office_locations;
create policy bol_select on public.brokerage_office_locations for select to authenticated
  using (public.is_zono_owner() or exists (
    select 1 from public.brokerage_offices o where o.id = office_id and public.brokerage_city_visible(o.city)));

drop policy if exists baa_select on public.brokerage_activity_areas;
create policy baa_select on public.brokerage_activity_areas for select to authenticated
  using (public.brokerage_city_visible(city));

drop policy if exists bcp_select on public.brokerage_contact_points;
create policy bcp_select on public.brokerage_contact_points for select to authenticated
  using (
    public.is_zono_owner()
    or (entity_type = 'office' and exists (select 1 from public.brokerage_offices o where o.id = entity_id and public.brokerage_city_visible(o.city)))
    or (entity_type = 'agent'  and exists (select 1 from public.brokerage_agents  a where a.id = entity_id and public.brokerage_city_visible(a.city)))
  );

drop policy if exists bell_select on public.brokerage_external_listing_links;
create policy bell_select on public.brokerage_external_listing_links for select to authenticated
  using (public.brokerage_city_visible(city));

-- System/management tables → zono_owner ONLY (office users never see these).
drop policy if exists bds_select on public.brokerage_data_sources;
create policy bds_select on public.brokerage_data_sources for select to authenticated using (public.is_zono_owner());

drop policy if exists brr_select on public.brokerage_refresh_runs;
create policy brr_select on public.brokerage_refresh_runs for select to authenticated using (public.is_zono_owner());

drop policy if exists bcl_select on public.brokerage_change_log;
create policy bcl_select on public.brokerage_change_log for select to authenticated using (public.is_zono_owner());

drop policy if exists bim_select on public.brokerage_identity_matches;
create policy bim_select on public.brokerage_identity_matches for select to authenticated using (public.is_zono_owner());

drop policy if exists bdc_select on public.brokerage_data_conflicts;
create policy bdc_select on public.brokerage_data_conflicts for select to authenticated using (public.is_zono_owner());

-- Read grants (writes are service-role only, which bypasses RLS).
grant select on public.brokerage_offices, public.brokerage_office_locations, public.brokerage_agents,
  public.brokerage_contact_points, public.brokerage_activity_areas, public.brokerage_data_sources,
  public.brokerage_refresh_runs, public.brokerage_change_log, public.brokerage_identity_matches,
  public.brokerage_data_conflicts, public.brokerage_external_listing_links to authenticated;

-- ── Seed the known public data sources ──────────────────────────────────────
insert into public.brokerage_data_sources (name, source_type, base_url, reliability_score) values
  ('Google Business', 'google',   'https://www.google.com/maps',  85),
  ('Yad2',            'yad2',     'https://www.yad2.co.il',       80),
  ('Madlan',          'madlan',   'https://www.madlan.co.il',     78),
  ('B144',            'b144',     'https://www.b144.co.il',       65),
  ('Easy',            'easy',     'https://www.easy.co.il',       60),
  ('Facebook',        'facebook', 'https://www.facebook.com',     55),
  ('Office website',  'website',  null,                            70),
  ('Manual entry',    'manual',   null,                           100)
on conflict (source_type, name) do nothing;
