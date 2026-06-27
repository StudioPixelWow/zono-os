-- ============================================================================
-- PHASE MAI-7 — Area Leader & Market Dominance Engine™.
--
-- Turns Broker Market Intelligence (MAI-6) into AREA intelligence: for each
-- market segment (org / city / neighborhood / property_type / rooms /
-- price_bucket) and time window, it determines who currently DOMINATES the
-- segment based ONLY on observed market behaviour.
--
-- It NEVER claims "broker sold the most". No official-sale count, no commission,
-- no revenue, no manual ranking. Instead: Observed Market Leadership /
-- Dominance / Momentum / Presence — each explainable, deterministic, evidence-
-- based. Small samples (<5) never crown a leader. Ties never produce an
-- unstable ranking. Org-scoped + RLS read; writes via the service role. No UI.
-- ============================================================================
create table if not exists public.market_area_leaders (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  city                      text,
  neighborhood              text,
  property_type             text,
  rooms                     numeric,
  price_bucket              text,
  window_days               integer not null,
  calculated_at             timestamptz not null default now(),
  model_version             text not null default 'mai-7.0',

  -- ── Leader (null when sample too small or a statistical tie) ──────────────
  leader_broker_id          uuid references public.broker_profiles(id) on delete set null,
  leader_confidence         numeric,

  -- ── Leader's observed market metrics ──────────────────────────────────────
  active_listing_share      numeric,   -- fraction 0..1 of area active listings
  market_success_share      numeric,   -- fraction 0..1 of area likely-success
  market_activity_share     numeric,   -- fraction 0..1 of area observed movement
  market_exit_speed         numeric,   -- 0..100 (faster than area median = higher)
  market_presence_score     numeric,   -- 0..100
  market_performance_index  numeric,   -- 0..100
  market_dominance_index    numeric,   -- 0..100 composite dominance
  market_momentum_index     numeric,   -- -100..100 recent vs long-run dominance

  sample_size               integer not null default 0,
  confidence                numeric not null default 0,

  -- ── Runner-up + separation ────────────────────────────────────────────────
  runner_up_broker_id       uuid references public.broker_profiles(id) on delete set null,
  runner_up_gap             numeric,   -- leader dominance − runner-up dominance

  evidence                  jsonb not null default '[]'::jsonb,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- One current leader row per segment + window (re-runs upsert in place).
-- NULLS NOT DISTINCT (PG15+) so coarse segments (NULL neighborhood/type/rooms/
-- bucket) dedupe correctly on upsert instead of duplicating every sync.
create unique index if not exists mal_segment_window_uidx
  on public.market_area_leaders (
    organization_id, city, neighborhood, property_type, rooms, price_bucket, window_days
  ) nulls not distinct;

create index if not exists mal_org_window_idx   on public.market_area_leaders (organization_id, window_days);
create index if not exists mal_org_city_idx      on public.market_area_leaders (organization_id, city, window_days);
create index if not exists mal_org_leader_idx    on public.market_area_leaders (organization_id, leader_broker_id);
create index if not exists mal_org_dominance_idx on public.market_area_leaders (organization_id, market_dominance_index);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.market_area_leaders enable row level security;

drop policy if exists mal_select on public.market_area_leaders;
create policy mal_select on public.market_area_leaders
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_area_leaders to authenticated;
