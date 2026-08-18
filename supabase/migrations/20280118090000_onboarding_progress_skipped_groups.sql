-- ZONO onboarding journey: persist deferred ("later" / "continue alone") groups
-- so skipping is resumable and never destroys orientation. Server-derived
-- completion is unaffected; this only records which skippable groups the office
-- chose to defer. Additive + backfilled; no RLS change (service-role only).
alter table public.onboarding_progress
  add column if not exists skipped jsonb not null default '[]'::jsonb;
