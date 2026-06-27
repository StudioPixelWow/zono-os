-- ============================================================================
-- PHASE MAI-10 — Broker Gap Analysis & ZONO Zone Dominance Score™.
--
-- Compares each broker against the segment's Winning DNA (MAI-9) and the area
-- leader (MAI-7), and persists measurable, explainable gaps + a cautious 0–100
-- Zone Dominance Score. It does NOT recommend, does NOT use AI, does NOT touch
-- the UI. It only answers: where is the broker strong, where is the broker
-- behind the winning pattern, and how far from area leadership.
--
-- One row per broker × segment × window. Deterministic, evidence-based, no fake
-- values. Org-scoped + RLS read; writes via the service role.
-- ============================================================================
create table if not exists public.broker_gap_analysis (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  broker_id                   uuid not null references public.broker_profiles(id) on delete cascade,
  city                        text,
  neighborhood                text,
  property_type               text,
  rooms                       numeric,
  price_bucket                text,
  window_days                 integer not null,
  calculated_at               timestamptz not null default now(),
  model_version               text not null default 'mai-10.0',

  -- ── Zone Dominance ────────────────────────────────────────────────────────
  zone_dominance_score        numeric,     -- 0..100, null when insufficient data
  zone_dominance_level        text,        -- LOW | EMERGING | COMPETITIVE | STRONG | LEADER_LIKE | INSUFFICIENT_DATA

  -- ── Measurable gaps vs Winning DNA / area leader ──────────────────────────
  leader_gap                  numeric,
  winning_dna_match_score     numeric,     -- 0..100
  success_rate_gap            numeric,     -- fraction (DNA − broker)
  exit_speed_gap_days         numeric,     -- days (broker − DNA)
  market_share_gap            numeric,     -- fraction (leader − broker)
  activity_gap                numeric,
  performance_gap             numeric,
  momentum_gap                numeric,
  coverage_gap                numeric,
  price_reduction_gap         numeric,     -- fraction (broker − DNA)

  -- ── Explainable detail (observed facts, never advice) ─────────────────────
  strengths                   jsonb not null default '[]'::jsonb,
  gaps                        jsonb not null default '[]'::jsonb,
  evidence                    jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  confidence                  numeric not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- One row per broker × segment × window (re-runs upsert in place).
-- NULLS NOT DISTINCT (PG15+) so coarse segments dedupe correctly on upsert.
create unique index if not exists bga_broker_segment_window_uidx
  on public.broker_gap_analysis (
    organization_id, broker_id, city, neighborhood, property_type, rooms, price_bucket, window_days
  ) nulls not distinct;

create index if not exists bga_org_broker_idx   on public.broker_gap_analysis (organization_id, broker_id);
create index if not exists bga_org_window_idx    on public.broker_gap_analysis (organization_id, window_days);
create index if not exists bga_org_city_idx      on public.broker_gap_analysis (organization_id, city, window_days);
create index if not exists bga_org_score_idx     on public.broker_gap_analysis (organization_id, zone_dominance_score);
create index if not exists bga_org_level_idx     on public.broker_gap_analysis (organization_id, zone_dominance_level);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.broker_gap_analysis enable row level security;

drop policy if exists bga_select on public.broker_gap_analysis;
create policy bga_select on public.broker_gap_analysis
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.broker_gap_analysis to authenticated;
