-- ============================================================================
-- ZONO — Buyer Demand Intelligence (Phase 26-Demand, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Turns ZONO from a property-intelligence system into a DEMAND-intelligence
-- system: what buyers want, where, what inventory is missing, and where the
-- acquisition opportunities are ("properties that should exist but don't").
--
-- HARD RULES (enforced in the engine, schema only stores results):
--   • No fake demand — every profile/cluster derives from REAL buyer rows.
--   • No generated buyers — clusters reference real public.buyers.
--   • No estimated inventory — gap counts come from REAL public.properties.
-- Tables: buyer_demand_profiles, demand_clusters, demand_cluster_buyers,
--         acquisition_signals, demand_heatmap_cells.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── buyer_demand_profiles — demand fingerprint per buyer ─────────────────────
create table if not exists public.buyer_demand_profiles (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  buyer_id                  uuid not null references public.buyers(id) on delete cascade,
  preferred_cities          text[] not null default '{}',
  preferred_neighborhoods   text[] not null default '{}',
  property_types            text[] not null default '{}',
  rooms_min                 numeric,
  rooms_max                 numeric,
  budget_min                numeric,
  budget_max                numeric,
  urgency_score             numeric,   -- 0..100 (real: temperature + readiness)
  financing_readiness_score numeric,   -- 0..100 (real: preapproval + readiness)
  search_activity_score     numeric,   -- 0..100 (real: contact recency)
  engagement_score          numeric,   -- 0..100 (real: temperature + recency)
  demand_score              numeric,   -- 0..100 composite
  demand_band               text,      -- hot | strong | active | low
  reasons                   jsonb not null default '[]'::jsonb,
  computed_at               timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (org_id, buyer_id)
);
create index if not exists buyer_demand_profiles_org_idx on public.buyer_demand_profiles(org_id);
create index if not exists buyer_demand_profiles_score_idx on public.buyer_demand_profiles(org_id, demand_score desc);

-- ── demand_clusters — aggregated demand segments + inventory gap ─────────────
create table if not exists public.demand_clusters (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  cluster_key      text not null,            -- area|type|rooms|budget bucket
  label            text not null,            -- "דירת 4 חדרים בקרית ביאליק עד 2.1M"
  area             text,                     -- city/neighborhood name (real, from buyer prefs)
  scope            text,                     -- 'city' | 'neighborhood'
  property_type    text,
  rooms_bucket     numeric,
  budget_ceiling   numeric,
  active_buyers    integer not null default 0,
  hot_buyers       integer not null default 0,
  avg_budget       numeric,
  urgency_score    numeric,                  -- 0..100
  demand_strength  numeric,                  -- 0..100
  demand_band      text,
  inventory_count  integer not null default 0, -- REAL matching properties
  gap_score        numeric,                  -- 0..100 demand-vs-supply gap
  gap_band         text,                     -- critical | very_high | high | medium | low
  reasons          jsonb not null default '[]'::jsonb,
  computed_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, cluster_key)
);
create index if not exists demand_clusters_org_idx on public.demand_clusters(org_id);
create index if not exists demand_clusters_gap_idx on public.demand_clusters(org_id, gap_score desc);
create index if not exists demand_clusters_strength_idx on public.demand_clusters(org_id, demand_strength desc);

-- ── demand_cluster_buyers — which real buyers belong to a cluster ────────────
create table if not exists public.demand_cluster_buyers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  cluster_id   uuid not null references public.demand_clusters(id) on delete cascade,
  buyer_id     uuid not null references public.buyers(id) on delete cascade,
  fit_score    numeric,        -- 0..100 how well the buyer fits the cluster
  is_hot       boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (cluster_id, buyer_id)
);
create index if not exists demand_cluster_buyers_cluster_idx on public.demand_cluster_buyers(cluster_id);
create index if not exists demand_cluster_buyers_org_idx on public.demand_cluster_buyers(org_id);

-- ── acquisition_signals — "properties that should exist but don't" ───────────
create table if not exists public.acquisition_signals (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  cluster_id        uuid references public.demand_clusters(id) on delete cascade,
  signal_type       text not null default 'inventory_shortage',
  title             text not null,
  area              text,
  scope             text,
  property_type     text,
  rooms_bucket      numeric,
  budget_ceiling    numeric,
  buyers_count      integer not null default 0,
  hot_buyers_count  integer not null default 0,
  inventory_count   integer not null default 0,
  gap_score         numeric,
  urgency_score     numeric,
  strength          numeric,         -- 0..100 opportunity strength
  competition       numeric,         -- buyers-per-available-property
  status            text not null default 'open', -- open | acted | dismissed
  reasons           jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, cluster_id)
);
create index if not exists acquisition_signals_org_idx on public.acquisition_signals(org_id);
create index if not exists acquisition_signals_strength_idx on public.acquisition_signals(org_id, strength desc);
create index if not exists acquisition_signals_status_idx on public.acquisition_signals(org_id, status);

-- ── demand_heatmap_cells — aggregated demand by geo/type (map-ready data) ────
-- Data only. No fake coordinates: cells carry a key + label + real counts; a
-- future geo layer joins these to real localities/neighborhoods centroids.
create table if not exists public.demand_heatmap_cells (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  scope            text not null,      -- 'locality' | 'neighborhood' | 'property_type'
  key              text not null,
  label            text not null,
  buyers_count     integer not null default 0,
  hot_buyers       integer not null default 0,
  avg_budget       numeric,
  demand_strength  numeric,            -- 0..100
  inventory_count  integer not null default 0,
  gap_score        numeric,
  computed_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (org_id, scope, key)
);
create index if not exists demand_heatmap_cells_org_idx on public.demand_heatmap_cells(org_id, scope);

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists trg_buyer_demand_profiles_updated on public.buyer_demand_profiles;
create trigger trg_buyer_demand_profiles_updated before update on public.buyer_demand_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_demand_clusters_updated on public.demand_clusters;
create trigger trg_demand_clusters_updated before update on public.demand_clusters for each row execute function public.set_updated_at();
drop trigger if exists trg_acquisition_signals_updated on public.acquisition_signals;
create trigger trg_acquisition_signals_updated before update on public.acquisition_signals for each row execute function public.set_updated_at();

-- ── RLS — same-org read; agent+ write ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'buyer_demand_profiles','demand_clusters','demand_cluster_buyers',
    'acquisition_signals','demand_heatmap_cells'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
