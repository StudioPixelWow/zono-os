-- ============================================================================
-- PHASE MAI-9 — Broker Winning DNA™.
--
-- Discovers REPEATABLE behavioural patterns shared by the most successful
-- brokers (the observed leaders) inside every market segment × window. It does
-- NOT generate recommendations and NEVER tells a user what to do — it only
-- describes Observed Winning Behaviour / Patterns / Market DNA.
--
-- Segment-level (no broker_id): one normalized "winning DNA" per segment +
-- window, aggregated from the segment's observed leaders. Deterministic,
-- evidence-based, no AI/LLM, no fake values. Org-scoped + RLS read; writes via
-- the service role. No UI.
-- ============================================================================
create table if not exists public.broker_winning_dna (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  city                        text,
  neighborhood                text,
  property_type               text,
  rooms                       numeric,
  price_bucket                text,
  window_days                 integer not null,
  calculated_at               timestamptz not null default now(),
  model_version               text not null default 'mai-9.0',

  sample_size                 integer not null default 0,
  confidence                  numeric not null default 0,

  -- ── Normalized winning profile + pattern groups (observed, never advice) ──
  winning_profile             jsonb not null default '{}'::jsonb,
  behaviour_patterns          jsonb not null default '[]'::jsonb,
  pricing_patterns            jsonb not null default '{}'::jsonb,
  activity_patterns           jsonb not null default '{}'::jsonb,
  listing_patterns            jsonb not null default '{}'::jsonb,
  market_patterns             jsonb not null default '{}'::jsonb,

  -- ── Headline observed metrics of the winning cohort ───────────────────────
  median_days_on_market       numeric,
  median_price_reduction_pct  numeric,    -- fraction 0..1
  market_success_rate         numeric,    -- fraction 0..1
  market_dominance            numeric,    -- 0..100 (avg leader dominance)
  market_share                numeric,    -- fraction 0..1 (leaders' active share)

  evidence                    jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- One winning-DNA row per segment + window (re-runs upsert in place).
-- NULLS NOT DISTINCT (PG15+) so coarse segments dedupe correctly on upsert.
create unique index if not exists bwd_segment_window_uidx
  on public.broker_winning_dna (
    organization_id, city, neighborhood, property_type, rooms, price_bucket, window_days
  ) nulls not distinct;

create index if not exists bwd_org_window_idx on public.broker_winning_dna (organization_id, window_days);
create index if not exists bwd_org_city_idx    on public.broker_winning_dna (organization_id, city, window_days);
create index if not exists bwd_org_calc_idx     on public.broker_winning_dna (organization_id, calculated_at);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.broker_winning_dna enable row level security;

drop policy if exists bwd_select on public.broker_winning_dna;
create policy bwd_select on public.broker_winning_dna
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.broker_winning_dna to authenticated;
