-- ============================================================================
-- ZONO OS 2.0 — Stage 0.4 · Meeting lifecycle (ADDITIVE, reversible).
-- Adds outcome capture + completion/cancellation metadata + follow-up link to
-- the EXISTING meetings table. The meeting_status enum already supports
-- scheduled/confirmed/completed/cancelled/no_show/rescheduled — no enum change.
-- No data rewrite. All columns nullable. Reversible by dropping the columns.
-- ============================================================================
alter table public.meetings add column if not exists completed_at        timestamptz;
alter table public.meetings add column if not exists outcome             text;
alter table public.meetings add column if not exists cancellation_reason text;
alter table public.meetings add column if not exists follow_up_task_id   uuid references public.tasks(id) on delete set null;

-- Fast "completed meetings" reporting (KPI) without scanning.
create index if not exists idx_meetings_org_status on public.meetings (org_id, status);
