-- ============================================================================
-- ZONO — PHASE 26.6: Agency Signals + Timeline Intelligence™
-- ----------------------------------------------------------------------------
-- Upgrades agency_signals + agency_timeline into a deduped, importance-scored,
-- lifecycle-aware intelligence layer. Additive + idempotent. No column removed.
-- A signal is uniquely identified by dedupe_key; an ACTIVE duplicate is updated
-- in place (never duplicated). No UI changes, no scraping, real data only.
-- ============================================================================

-- ── agency_signals — intelligence columns ───────────────────────────────────
alter table public.agency_signals
  add column if not exists entity_type   text,
  add column if not exists entity_id     text,
  add column if not exists territory_type text,
  add column if not exists city          text,
  add column if not exists neighborhood  text,
  add column if not exists street        text,
  add column if not exists score_before  numeric,
  add column if not exists score_after   numeric,
  add column if not exists importance    numeric,            -- 0..100
  add column if not exists confidence    numeric,            -- 0..1
  add column if not exists status        text not null default 'active', -- active|resolved|ignored|archived
  add column if not exists dedupe_key    text,
  add column if not exists detected_at   timestamptz not null default now(),
  add column if not exists resolved_at   timestamptz,
  add column if not exists expires_at    timestamptz;

create index if not exists agency_signals_status_idx     on public.agency_signals(organization_id, status);
create index if not exists agency_signals_dedupe_idx      on public.agency_signals(dedupe_key);
create index if not exists agency_signals_agency_status_idx on public.agency_signals(agency_id, status, detected_at desc);
-- One ACTIVE signal per dedupe_key (partial unique → upsert target for the detector).
create unique index if not exists agency_signals_active_dedupe_uniq
  on public.agency_signals(dedupe_key) where status = 'active' and dedupe_key is not null;

-- ── agency_timeline — intelligence columns ──────────────────────────────────
alter table public.agency_timeline
  add column if not exists entity_type    text,
  add column if not exists entity_id      text,
  add column if not exists territory_type text,
  add column if not exists city           text,
  add column if not exists neighborhood   text,
  add column if not exists street         text,
  add column if not exists importance     numeric,            -- 0..100
  add column if not exists dedupe_key     text;

create index if not exists agency_timeline_importance_idx on public.agency_timeline(agency_id, importance desc, event_date desc);
create unique index if not exists agency_timeline_dedupe_uniq
  on public.agency_timeline(dedupe_key) where dedupe_key is not null;
