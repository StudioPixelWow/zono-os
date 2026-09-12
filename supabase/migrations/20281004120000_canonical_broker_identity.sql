-- ============================================================================
-- ZONO — CANONICAL BROKER IDENTITY (additive, backwards-compatible, idempotent).
-- Unifies the two parallel agent-identity systems (broker_profiles used by
-- detected_broker_id, and brokerage_agents used by office intelligence) under ONE
-- canonical broker, WITHOUT deleting or rewriting either source. Provenance is
-- preserved via broker_identity_links; office membership (with history + confidence
-- + evidence) via broker_office_memberships. Nothing is dropped; both source tables
-- keep working. Shared observed-market graph → RLS read for authenticated, writes
-- via service-role (same pattern as brokerage_agents / brokerage_offices).
-- ============================================================================

create table if not exists public.canonical_brokers (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text,
  primary_phone text,
  normalized_phone text,
  primary_email text,
  normalized_email text,
  city text,
  verification_status text not null default 'unverified',   -- verified|high|medium|low|ambiguous|unknown
  confidence integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists canonical_brokers_norm_phone_idx on public.canonical_brokers (normalized_phone) where normalized_phone is not null;
create index if not exists canonical_brokers_norm_name_idx  on public.canonical_brokers (normalized_name);

-- Every source identity that resolved to a canonical broker (provenance kept).
create table if not exists public.broker_identity_links (
  id uuid primary key default gen_random_uuid(),
  canonical_broker_id uuid not null references public.canonical_brokers(id) on delete cascade,
  source_type text not null,          -- broker_profile | brokerage_agent | user | external
  source_id text not null,
  evidence text,
  confidence integer not null default 0,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index if not exists broker_identity_links_canonical_idx on public.broker_identity_links (canonical_broker_id);

-- Broker → office membership, with history (valid_from/to), confidence, evidence.
create table if not exists public.broker_office_memberships (
  id uuid primary key default gen_random_uuid(),
  canonical_broker_id uuid not null references public.canonical_brokers(id) on delete cascade,
  office_id uuid not null,
  is_current boolean not null default true,
  confidence integer not null default 0,
  source text,                         -- explicit_agency_name | inherited | roster | confirmed
  evidence text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_broker_id, office_id)
);
create index if not exists broker_office_memberships_office_idx  on public.broker_office_memberships (office_id) where is_current;
create index if not exists broker_office_memberships_broker_idx  on public.broker_office_memberships (canonical_broker_id);

alter table public.canonical_brokers          enable row level security;
alter table public.broker_identity_links      enable row level security;
alter table public.broker_office_memberships  enable row level security;

drop policy if exists canonical_brokers_read on public.canonical_brokers;
create policy canonical_brokers_read on public.canonical_brokers for select to authenticated using (true);
drop policy if exists broker_identity_links_read on public.broker_identity_links;
create policy broker_identity_links_read on public.broker_identity_links for select to authenticated using (true);
drop policy if exists broker_office_memberships_read on public.broker_office_memberships;
create policy broker_office_memberships_read on public.broker_office_memberships for select to authenticated using (true);
