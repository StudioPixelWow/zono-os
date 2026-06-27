-- ==========================================================================
-- ZONO — Supabase handover: Orchestrator + Market Acceptance Intelligence (MAI-1..5)
-- Run TOP-TO-BOTTOM in the Supabase SQL editor. Idempotent (CREATE IF NOT EXISTS).
-- Safe to re-run. No backfill required — engines populate on the next sync.
-- Generated: 2026-06-27T13:01:22Z
-- ==========================================================================


-- ===== 20260780120000_zono_orchestrator.sql =====

-- ============================================================================
-- ZONO — PHASE 26: Automation Orchestrator™
-- Central orchestration layer that connects external sync → market sources →
-- snapshots → decision brain → events → alerts → revalidation into one run.
-- Two infra tables: run ledger + per-org concurrency lock.
-- Additive + idempotent. Org column: organization_id. RLS via current_org_id();
-- service-role (cron) bypasses RLS.
-- ============================================================================

-- ── Run ledger ───────────────────────────────────────────────────────────────
create table if not exists public.zono_orchestrator_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  trigger         text not null,                       -- login|dashboard_load|manual_sync|scheduled_cron|property_created|property_updated|external_sync_completed|transactions_sync_completed
  source          text,
  status          text not null default 'running',     -- running|success|partial|failed|skipped
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_ms     integer,
  steps           jsonb not null default '[]'::jsonb,   -- [{ name, status, durationMs, summary, error? }]
  error           text,
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists zono_orch_runs_org_idx        on public.zono_orchestrator_runs(organization_id);
create index if not exists zono_orch_runs_recent_idx     on public.zono_orchestrator_runs(organization_id, started_at desc);
create index if not exists zono_orch_runs_org_status_idx on public.zono_orchestrator_runs(organization_id, status, finished_at desc);

-- ── Per-org concurrency lock ─────────────────────────────────────────────────
create table if not exists public.zono_orchestrator_locks (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  locked_at       timestamptz not null default now(),
  lock_token      text not null,
  expires_at      timestamptz not null,
  trigger         text,
  created_by      uuid references public.users(id) on delete set null
);

create index if not exists zono_orch_locks_expiry_idx on public.zono_orchestrator_locks(expires_at);

-- ── RLS — org isolation; reads for the org, writes for agents+ ───────────────
-- (The orchestrator itself writes via the service-role client, which bypasses
--  RLS; these policies govern any in-app reads/inspection.)
do $$
begin
  execute 'alter table public.zono_orchestrator_runs enable row level security;';
  execute 'drop policy if exists zono_orch_runs_select on public.zono_orchestrator_runs;';
  execute 'create policy zono_orch_runs_select on public.zono_orchestrator_runs for select to authenticated using (organization_id = public.current_org_id());';
  execute 'drop policy if exists zono_orch_runs_insert on public.zono_orchestrator_runs;';
  execute 'create policy zono_orch_runs_insert on public.zono_orchestrator_runs for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
  execute 'drop policy if exists zono_orch_runs_update on public.zono_orchestrator_runs;';
  execute 'create policy zono_orch_runs_update on public.zono_orchestrator_runs for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'alter table public.zono_orchestrator_locks enable row level security;';
  execute 'drop policy if exists zono_orch_locks_select on public.zono_orchestrator_locks;';
  execute 'create policy zono_orch_locks_select on public.zono_orchestrator_locks for select to authenticated using (organization_id = public.current_org_id());';
  execute 'drop policy if exists zono_orch_locks_all on public.zono_orchestrator_locks;';
  execute 'create policy zono_orch_locks_all on public.zono_orchestrator_locks for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
end $$;

grant select, insert, update, delete on public.zono_orchestrator_runs  to authenticated;
grant select, insert, update, delete on public.zono_orchestrator_locks to authenticated;


-- ===== 20260790120000_market_listing_lifecycle.sql =====

-- ============================================================================
-- PHASE MAI-1 — Market Acceptance Intelligence™ FOUNDATION.
--
-- Observes the lifecycle of every external listing as EVIDENCE — it never
-- assumes a property was sold. Two tables:
--   • market_listing_lifecycle — one row per (org, provider, external_id),
--     the current observed state + last-known snapshot + counters.
--   • market_listing_events     — append-only, immutable timeline of every
--     observed lifecycle change.
--
-- NO market logic here (no Likely-Sold / Acceptance Score / valuation impact).
-- This migration only captures and preserves evidence. Org-scoped + RLS;
-- writes happen via the service role (the sync reconciler), reads by org members.
-- ============================================================================

-- ── Lifecycle (one row per external listing) ────────────────────────────────
create table if not exists public.market_listing_lifecycle (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  provider                 text not null,                 -- yad2 | madlan | ...
  external_id              text not null,                 -- provider listing id
  listing_url              text,
  first_seen_at            timestamptz not null default now(),
  last_seen_at             timestamptz not null default now(),
  last_scan_at             timestamptz not null default now(),
  current_state            text not null default 'ACTIVE',-- ACTIVE | DISAPPEARED | RETURNED | LIKELY_SOLD | LIKELY_REMOVED | UNKNOWN
  days_on_market           integer not null default 0,    -- observed elapsed days since first_seen_at (evidence, not a sale claim)
  times_seen               integer not null default 0,
  times_disappeared        integer not null default 0,
  times_returned           integer not null default 0,
  last_known_price         bigint,
  last_known_status        text,
  last_known_images        jsonb,
  last_known_coordinates   jsonb,                          -- { lat, lng } or null — real only
  last_known_address       text,
  last_known_city          text,
  last_known_neighborhood  text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create index if not exists mll_org_state_idx        on public.market_listing_lifecycle (organization_id, current_state);
create index if not exists mll_org_provider_ext_idx on public.market_listing_lifecycle (organization_id, provider, external_id);
create index if not exists mll_last_scan_idx         on public.market_listing_lifecycle (organization_id, last_scan_at);

-- ── Events (append-only, immutable timeline) ────────────────────────────────
create table if not exists public.market_listing_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  lifecycle_id     uuid references public.market_listing_lifecycle(id) on delete cascade,
  provider         text not null,
  external_id      text not null,
  event_type       text not null,   -- FIRST_SEEN | PRICE_CHANGED | IMAGE_CHANGED | DESCRIPTION_CHANGED | STATUS_CHANGED | DISAPPEARED | RETURNED | REAPPEARED_WITH_NEW_ID | LIKELY_DUPLICATE | MANUAL_OVERRIDE
  previous_value   jsonb,
  new_value        jsonb,
  confidence       numeric not null default 1.0,  -- 1.0 = directly observed; <1 reserved for inferred events (later phases)
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists mle_org_provider_ext_idx on public.market_listing_events (organization_id, provider, external_id, created_at);
create index if not exists mle_lifecycle_idx          on public.market_listing_events (lifecycle_id, created_at);
create index if not exists mle_event_type_idx         on public.market_listing_events (organization_id, event_type, created_at);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.market_listing_lifecycle enable row level security;
alter table public.market_listing_events    enable row level security;

drop policy if exists mll_select on public.market_listing_lifecycle;
create policy mll_select on public.market_listing_lifecycle
  for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists mle_select on public.market_listing_events;
create policy mle_select on public.market_listing_events
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_listing_lifecycle to authenticated;
grant select on public.market_listing_events    to authenticated;


-- ===== 20260791120000_market_listing_signals.sql =====

-- ============================================================================
-- PHASE MAI-2 — Market Acceptance Intelligence™ SIGNAL ENGINE.
--
-- Stores independent, observable market SIGNALS computed from each listing's
-- lifecycle + event history. EVIDENCE ONLY — no scores, no "likely sold", no
-- probability, no AI/valuation/heatmap interpretation (those are later phases).
--
-- One row per (org, provider, external_id). `signals` is a jsonb map of
-- name → { value, source, lastUpdated, confidence }. Recomputed after every
-- external sync; the prior snapshot is retained under metadata.previous so
-- later phases can compare. Org-scoped + RLS read; service-role writes.
-- ============================================================================
create table if not exists public.market_listing_signals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  provider            text not null,
  external_id         text not null,
  lifecycle_id        uuid references public.market_listing_lifecycle(id) on delete set null,
  signal_version      text not null default 'mai-2.0',
  last_calculated_at  timestamptz not null default now(),
  signals             jsonb not null default '{}'::jsonb,   -- name → { value, source, lastUpdated, confidence }
  confidence_inputs   jsonb not null default '{}'::jsonb,   -- which fields fed confidence (for explainability)
  metadata            jsonb not null default '{}'::jsonb,   -- { previous: <prior signals> } etc.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create index if not exists mls_org_provider_ext_idx on public.market_listing_signals (organization_id, provider, external_id);
create index if not exists mls_org_calc_idx          on public.market_listing_signals (organization_id, last_calculated_at);
create index if not exists mls_lifecycle_idx          on public.market_listing_signals (lifecycle_id);

alter table public.market_listing_signals enable row level security;

drop policy if exists mls_select on public.market_listing_signals;
create policy mls_select on public.market_listing_signals
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_listing_signals to authenticated;


-- ===== 20260792120000_market_acceptance_scores.sql =====

-- ============================================================================
-- PHASE MAI-3 — Market Exit & Acceptance Confidence Engine.
--
-- The FIRST interpretation layer: turns the observable MAI-2 signals into
-- cautious, explainable confidence models. It NEVER claims a property was sold
-- and NEVER creates an official sale record. DISAPPEARED is a fact; SOLD is not.
-- classification is "likely" only — OFFICIAL_TRANSACTION_FOUND requires a real
-- matched official transaction (not produced in MAI-3).
--
-- Deterministic + explainable: every score carries evidence + a Hebrew
-- explanation. No valuation / heatmap / decision-brain wiring in this phase.
-- ============================================================================
create table if not exists public.market_acceptance_scores (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  provider                      text not null,
  external_id                   text not null,
  signal_version                text not null,
  model_version                 text not null,
  calculated_at                 timestamptz not null default now(),
  market_exit_confidence        numeric,
  market_acceptance_confidence  numeric,
  market_rejection_confidence   numeric,
  classification                text not null,   -- ACTIVE | LIKELY_MARKET_EXIT | LIKELY_ACCEPTED | LIKELY_REJECTED | UNCERTAIN | RETURNED | OFFICIAL_TRANSACTION_FOUND
  evidence                      jsonb not null default '[]'::jsonb,
  confidence_inputs             jsonb not null default '{}'::jsonb,
  explanation                   text,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (organization_id, provider, external_id, model_version)
);

create index if not exists mas_org_classification_idx on public.market_acceptance_scores (organization_id, classification);
create index if not exists mas_org_calc_idx            on public.market_acceptance_scores (organization_id, calculated_at);
create index if not exists mas_org_provider_ext_idx    on public.market_acceptance_scores (organization_id, provider, external_id);

alter table public.market_acceptance_scores enable row level security;

drop policy if exists mas_select on public.market_acceptance_scores;
create policy mas_select on public.market_acceptance_scores
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_acceptance_scores to authenticated;


-- ===== 20260793120000_market_acceptance_aggregates.sql =====

-- ============================================================================
-- PHASE MAI-4 — Market Acceptance Aggregates Engine.
--
-- Rolls listing-level Market Acceptance Intelligence (MAI-1 lifecycle, MAI-2
-- signals, MAI-3 confidence) up into MARKET-level metrics by org / city /
-- neighborhood / property_type / rooms / price bucket, across 7/14/30/60/90-day
-- windows. EVIDENCE-based and cautious — small samples are flagged, never
-- overstated. NEVER claims an official sale (LIKELY_ACCEPTED ≠ sold). No
-- valuation / heatmap / decision-brain / UI wiring in this phase.
-- ============================================================================
create table if not exists public.market_acceptance_aggregates (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  city                        text,
  neighborhood                text,
  property_type               text,
  rooms                       numeric,
  price_bucket                text,
  window_days                 integer not null,
  window_start                timestamptz not null,
  window_end                  timestamptz not null,
  active_count                integer not null default 0,
  disappeared_count           integer not null default 0,
  likely_exit_count           integer not null default 0,
  likely_accepted_count       integer not null default 0,
  likely_rejected_count       integer not null default 0,
  uncertain_count             integer not null default 0,
  returned_count              integer not null default 0,
  median_days_on_market       numeric,
  avg_days_on_market          numeric,
  avg_last_known_price        numeric,
  median_last_known_price     numeric,
  avg_price_reduction_pct     numeric,
  median_price_reduction_pct  numeric,
  market_exit_rate            numeric,
  market_acceptance_rate      numeric,
  market_rejection_rate       numeric,
  absorption_speed_score      numeric,
  sample_size                 integer not null default 0,
  confidence                  numeric not null default 0,
  evidence                    jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- NULLS NOT DISTINCT (PG15+) so coarse segments (NULL neighborhood/type/rooms/
-- bucket) dedupe correctly on upsert; otherwise every sync would duplicate them.
create unique index if not exists maa_segment_window_uidx
  on public.market_acceptance_aggregates (
    organization_id, city, neighborhood, property_type, rooms, price_bucket, window_days, window_end
  ) nulls not distinct;

create index if not exists maa_org_window_idx on public.market_acceptance_aggregates (organization_id, window_days, window_end);
create index if not exists maa_org_city_idx   on public.market_acceptance_aggregates (organization_id, city, window_days);

alter table public.market_acceptance_aggregates enable row level security;

drop policy if exists maa_select on public.market_acceptance_aggregates;
create policy maa_select on public.market_acceptance_aggregates
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_acceptance_aggregates to authenticated;


-- ===== 20260794120000_valuation_weight_results.sql =====

-- ============================================================================
-- PHASE MAI-5 — Valuation Weight Engine™ (Market Acceptance integration).
--
-- A TRANSPARENT weighting layer that combines multiple evidence sources into a
-- valuation CONFIDENCE + range. It does NOT replace the valuation model and does
-- NOT change the estimated VALUE — official transactions remain the strongest
-- source and the central value always comes from the existing AVM engine.
-- Market Acceptance Intelligence is one additional, weighted signal that may
-- slightly raise/lower confidence and narrow/widen the range — never override a
-- verified transaction, never invent a sale price. Deterministic, no AI/LLM.
-- ============================================================================
create table if not exists public.valuation_weight_results (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  property_id                   uuid,
  valuation_id                  uuid,
  provider                      text,
  external_id                   text,
  valuation_version             text not null,
  weight_profile                text not null default 'STANDARD',
  calculated_at                 timestamptz not null default now(),
  official_transactions_weight  numeric,
  current_market_weight         numeric,
  market_acceptance_weight      numeric,
  market_trend_weight           numeric,
  listing_similarity_weight     numeric,
  location_weight               numeric,
  property_features_weight      numeric,
  final_confidence              numeric,
  estimated_value               numeric,
  estimated_low                 numeric,
  estimated_high                numeric,
  evidence                      jsonb not null default '[]'::jsonb,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- One current result per valuation + profile (re-runs upsert in place).
create unique index if not exists vwr_valuation_profile_uidx
  on public.valuation_weight_results (organization_id, valuation_id, weight_profile)
  nulls not distinct;

create index if not exists vwr_org_property_idx on public.valuation_weight_results (organization_id, property_id);
create index if not exists vwr_org_calc_idx     on public.valuation_weight_results (organization_id, calculated_at);

alter table public.valuation_weight_results enable row level security;

drop policy if exists vwr_select on public.valuation_weight_results;
create policy vwr_select on public.valuation_weight_results
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.valuation_weight_results to authenticated;

