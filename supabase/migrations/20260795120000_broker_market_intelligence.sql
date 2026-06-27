-- ============================================================================
-- PHASE MAI-6 — Broker Market Intelligence™ FOUNDATION.
--
-- A complete market-PERFORMANCE profile for every broker, computed ONLY from
-- real observed market behaviour (MAI-1 lifecycle, MAI-2 signals, MAI-3
-- confidence, MAI-4 aggregates, external_listings broker attribution).
--
-- It NEVER claims an official sale. There is no "sold", "closed deal",
-- "transaction" or "commission" here. Instead it records cautious, evidence-
-- based metrics: Likely Market Success, Likely Market Exit, observed market
-- behaviour, performance index, activity score — each with explainable
-- evidence + a confidence that drops on small samples.
--
-- One row per (organization_id, broker_id, model_version). Recomputed after
-- MAI-5. Org-scoped + RLS read; writes happen via the service role (the sync
-- pipeline). No rankings, no AI recommendations, no UI in this phase.
-- ============================================================================
create table if not exists public.broker_market_intelligence (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  broker_id                     uuid not null references public.broker_profiles(id) on delete cascade,
  calculated_at                 timestamptz not null default now(),
  model_version                 text not null default 'mai-6.0',

  -- ── Observed listing counts (evidence, never sale claims) ─────────────────
  active_listings               integer not null default 0,
  likely_market_exit_count      integer not null default 0,
  likely_market_success_count   integer not null default 0,   -- LIKELY_ACCEPTED (NOT a confirmed sale)
  likely_market_rejected_count  integer not null default 0,
  returned_listing_count        integer not null default 0,
  uncertain_listing_count       integer not null default 0,
  total_observed_listings       integer not null default 0,
  eligible_listings             integer not null default 0,   -- success + exit + rejected (denominator for rates)

  -- ── Observed market-behaviour rates (fractions 0..1; null when no evidence)
  market_success_rate           numeric,
  market_rejection_rate         numeric,
  market_exit_rate              numeric,

  -- ── Observed time / price metrics ─────────────────────────────────────────
  median_days_on_market         numeric,
  average_days_on_market        numeric,
  median_price_reduction_pct    numeric,   -- fraction 0..1
  average_price_reduction_pct   numeric,   -- fraction 0..1
  average_last_known_price      numeric,

  -- ── Dominant observed segment ─────────────────────────────────────────────
  dominant_city                 text,
  dominant_neighborhood         text,
  dominant_property_type        text,
  dominant_room_count           numeric,
  dominant_price_bucket         text,

  -- ── Composite scores (0..100; null when not enough evidence) ──────────────
  market_activity_score         numeric,
  market_performance_index      numeric,
  confidence                    numeric not null default 0,

  evidence                      jsonb not null default '[]'::jsonb,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- One current profile per broker + model (re-runs upsert in place — no dupes).
create unique index if not exists bmi_broker_model_uidx
  on public.broker_market_intelligence (organization_id, broker_id, model_version);

create index if not exists bmi_org_idx          on public.broker_market_intelligence (organization_id);
create index if not exists bmi_org_calc_idx     on public.broker_market_intelligence (organization_id, calculated_at);
create index if not exists bmi_org_activity_idx on public.broker_market_intelligence (organization_id, market_activity_score);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.broker_market_intelligence enable row level security;

drop policy if exists bmi_select on public.broker_market_intelligence;
create policy bmi_select on public.broker_market_intelligence
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.broker_market_intelligence to authenticated;
