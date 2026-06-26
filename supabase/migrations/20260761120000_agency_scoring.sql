-- ============================================================================
-- ZONO — PHASE 26.5: Agency Scoring Engine™
-- ----------------------------------------------------------------------------
-- Extends agency_scores with the competition-threat score, data confidence, a
-- full score breakdown (jsonb) and the period the scores cover. Additive +
-- idempotent — no existing column is removed or changed. RLS already exists on
-- agency_scores (Phase 26.0). No UI, no scraping, no mock data.
-- ============================================================================

alter table public.agency_scores
  add column if not exists competition_threat numeric,
  add column if not exists data_confidence    numeric,           -- 0..100
  add column if not exists score_breakdown    jsonb not null default '{}'::jsonb,
  add column if not exists period_start       timestamptz,
  add column if not exists period_end         timestamptz,
  add column if not exists calculated_at      timestamptz;

create index if not exists agency_scores_overall_idx on public.agency_scores(organization_id, overall desc);
create index if not exists agency_scores_threat_idx  on public.agency_scores(organization_id, competition_threat desc);
