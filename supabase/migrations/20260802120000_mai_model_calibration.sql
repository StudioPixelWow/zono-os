-- ============================================================================
-- PHASE MAI-13 — Self-Learning & Model Calibration™.
--
-- The final observability layer of Market Acceptance Intelligence™. It does NOT
-- modify any model, weight or threshold. It only MEASURES — comparing each MAI
-- model's historical predictions against later observed evidence (official
-- transactions, lifecycle outcomes, snapshot drift) and persisting accuracy,
-- precision, recall, F1, calibration, confidence-accuracy, false-positive /
-- false-negative rates and prediction-stability per model. It may RECOMMEND a
-- calibration action (raise/lower threshold, collect more evidence, review the
-- weight profile) but NEVER applies it — calibration stays human-controlled.
-- Deterministic, no LLM, no free text, no fake values. Org-scoped + RLS read;
-- service-role writes. No UI.
-- ============================================================================
create table if not exists public.mai_model_calibration (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  model_name                  text not null,            -- MARKET_ACCEPTANCE | GAP_ANALYSIS | WINNING_DNA | BROKER_COACH | GROWTH_STRATEGY | ZONE_DOMINANCE | VALUATION_WEIGHT
  model_version               text not null,            -- observed model_version of the evaluated model
  evaluation_window_days      integer not null default 30,
  evaluated_at                timestamptz not null default now(),

  -- ── Measured metrics (all observational; null ⇒ not enough evidence) ───────
  sample_size                 integer not null default 0,
  accuracy                    numeric,
  precision                   numeric,
  recall                      numeric,
  f1_score                    numeric,
  calibration_score           numeric,   -- 1 - expected calibration error (0..1)
  confidence_accuracy         numeric,   -- how well stated confidence matched reality (0..1)
  false_positive_rate         numeric,
  false_negative_rate         numeric,
  prediction_stability        numeric,   -- 1 - mean normalised drift across snapshots (0..1)

  -- ── Recommendations (advisory only — NEVER auto-applied) ──────────────────
  recommended_action          text,      -- NONE | INCREASE_THRESHOLD | LOWER_THRESHOLD | COLLECT_MORE_EVIDENCE | INCREASE_SAMPLE | REVIEW_WEIGHT_PROFILE
  recommended_weight_change   numeric,   -- suggested delta only; human decides
  recommended_threshold_change numeric,  -- suggested delta only; human decides

  -- ── Traceability ──────────────────────────────────────────────────────────
  evidence                    jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- One current calibration row per model + version + evaluation window (re-runs upsert).
create unique index if not exists mmc_model_window_uidx
  on public.mai_model_calibration (organization_id, model_name, model_version, evaluation_window_days);

create index if not exists mmc_org_idx           on public.mai_model_calibration (organization_id);
create index if not exists mmc_org_model_idx     on public.mai_model_calibration (organization_id, model_name);
create index if not exists mmc_org_evaluated_idx on public.mai_model_calibration (organization_id, evaluated_at);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.mai_model_calibration enable row level security;

drop policy if exists mmc_select on public.mai_model_calibration;
create policy mmc_select on public.mai_model_calibration
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.mai_model_calibration to authenticated;
