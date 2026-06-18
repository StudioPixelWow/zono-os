-- ============================================================================
-- ZONO — 0005 · Inventory: projects, units, properties
-- ----------------------------------------------------------------------------
-- projects = primary-market developments; units = sellable units inside a
-- project; properties = secondary-market listings (optionally owned by a
-- seller). Prices are integer whole shekels.
-- ============================================================================

-- ── projects ──────────────────────────────────────────────────────────────────
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  owner_id        uuid references public.users(id) on delete set null,
  name            text not null,
  developer_name  text,
  description     text,
  type            project_type,
  status          project_status not null default 'planning',
  location        jsonb not null default '{}'::jsonb,
  city            text,
  region          region,
  total_units     integer check (total_units is null or total_units >= 0),
  available_units integer check (available_units is null or available_units >= 0),
  price_min       integer check (price_min is null or price_min >= 0),
  price_max       integer check (price_max is null or price_max >= 0),
  delivery_date   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_projects_org on public.projects (org_id);
create index idx_projects_owner on public.projects (owner_id);
create index idx_projects_org_status on public.projects (org_id, status);
create index idx_projects_region on public.projects (region);

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ── units ─────────────────────────────────────────────────────────────────────
create table public.units (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  unit_number  text not null,
  type         property_type,
  status       unit_status not null default 'available',
  floor        integer,
  rooms        numeric(3,1),
  size_sqm     integer,
  outdoor_sqm  integer,
  exposure     text,
  price        integer check (price is null or price >= 0),
  features     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint units_project_number_unique unique (project_id, unit_number)
);

create index idx_units_org on public.units (org_id);
create index idx_units_project on public.units (project_id);
create index idx_units_project_status on public.units (project_id, status);

create trigger trg_units_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- ── properties ────────────────────────────────────────────────────────────────
create table public.properties (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  owner_id               uuid references public.users(id) on delete set null,
  seller_id              uuid references public.sellers(id) on delete set null,
  project_id             uuid references public.projects(id) on delete set null,
  title                  text not null,
  description            text,
  type                   property_type not null,
  listing_kind           listing_kind not null default 'sale',
  status                 property_status not null default 'draft',
  price                  integer not null check (price >= 0),
  monthly_rent           integer check (monthly_rent is null or monthly_rent >= 0),
  rooms                  numeric(3,1),
  size_sqm               integer,
  outdoor_sqm            integer,
  floor                  integer,
  total_floors           integer,
  has_parking            boolean not null default false,
  has_elevator           boolean not null default false,
  has_balcony            boolean not null default false,
  has_safe_room          boolean not null default false,
  has_storage            boolean not null default false,
  is_accessible          boolean not null default false,
  location               jsonb not null default '{}'::jsonb,
  city                   text,
  region                 region,
  zono_score             smallint check (zono_score between 0 and 100),
  estimated_days_to_sell smallint,
  has_exclusivity        boolean not null default false,
  exclusivity_ends_at    timestamptz,
  listed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_properties_org on public.properties (org_id);
create index idx_properties_owner on public.properties (owner_id);
create index idx_properties_seller on public.properties (seller_id);
create index idx_properties_project on public.properties (project_id);
create index idx_properties_org_status on public.properties (org_id, status);
create index idx_properties_type on public.properties (type);
create index idx_properties_region on public.properties (region);
create index idx_properties_price on public.properties (price);
create index idx_properties_location on public.properties using gin (location);
create index idx_properties_exclusivity on public.properties (exclusivity_ends_at)
  where has_exclusivity;

create trigger trg_properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();
