-- ============================================================================
-- ZONO — 0004 · Contacts (parties): buyers, sellers
-- ----------------------------------------------------------------------------
-- Buyers carry the search criteria consumed by the matching engine. Sellers
-- own properties (see 0005). Both are org-scoped and assigned to an owner_id
-- (the responsible agent). Created before inventory because properties FK to
-- sellers.
-- ============================================================================

-- ── buyers ────────────────────────────────────────────────────────────────────
create table public.buyers (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  owner_id             uuid references public.users(id) on delete set null,
  full_name            text not null,
  phone                text,
  email                citext,
  preferred_channel    preferred_channel,
  notes                text,
  temperature          buyer_temperature,
  budget_min           integer check (budget_min is null or budget_min >= 0),
  budget_max           integer check (budget_max is null or budget_max >= 0),
  rooms_min            numeric(3,1),
  rooms_max            numeric(3,1),
  size_min_sqm         integer,
  size_max_sqm         integer,
  preferred_types      property_type[] not null default '{}',
  preferred_regions    region[] not null default '{}',
  preferred_areas      text[] not null default '{}',
  must_have_parking    boolean not null default false,
  must_have_elevator   boolean not null default false,
  must_have_safe_room  boolean not null default false,
  readiness            smallint check (readiness between 0 and 100),
  has_preapproval      boolean not null default false,
  preferences          jsonb not null default '{}'::jsonb,
  last_contacted_at    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_buyers_org on public.buyers (org_id);
create index idx_buyers_owner on public.buyers (owner_id);
create index idx_buyers_org_temperature on public.buyers (org_id, temperature);
create index idx_buyers_preferences on public.buyers using gin (preferences);
create index idx_buyers_phone on public.buyers (phone);

create trigger trg_buyers_updated_at
  before update on public.buyers
  for each row execute function public.set_updated_at();

-- ── sellers ───────────────────────────────────────────────────────────────────
create table public.sellers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  owner_id           uuid references public.users(id) on delete set null,
  full_name          text not null,
  phone              text,
  email              citext,
  preferred_channel  preferred_channel,
  notes              text,
  motivation         seller_motivation,
  expected_price     integer check (expected_price is null or expected_price >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_sellers_org on public.sellers (org_id);
create index idx_sellers_owner on public.sellers (owner_id);

create trigger trg_sellers_updated_at
  before update on public.sellers
  for each row execute function public.set_updated_at();
