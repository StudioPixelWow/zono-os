-- ============================================================================
-- 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Canonical Journey Spine.
--
-- CANONICAL DECISION (evidence-based, verified live on zono-dev):
--   `journeys` already IS the entity-agnostic spine (journey_type / entity_type /
--   entity_id / current_stage / status / stage_entered_at / scores) and holds
--   0 rows — it was created but never populated. `journey_events` already IS the
--   append-only from_stage→to_stage history and holds 0 rows.
--   => We do NOT create a second Journey system. This migration is purely
--      ADDITIVE on those two tables, adding only the canonical fields they lack.
--
-- Legacy tables are NOT touched here (they are demoted to compatibility inputs
-- and backfilled in Batch 5.3):
--   property_journeys (10 rows, `journey_stage` enum)  · deal_journeys (0 rows)
--   journey_stages (31 seed rows) · 17 other journey_* satellites (0 rows)
--
-- Additive + idempotent: safe to re-run. RLS already enabled with org-scoped
-- policies on both tables — unchanged.
-- ============================================================================

-- ── 1. journeys — canonical spine columns ───────────────────────────────────
alter table public.journeys
  add column if not exists owner_user_id uuid references public.users(id) on delete set null,
  add column if not exists completed_at  timestamptz,
  add column if not exists paused_at     timestamptz,
  add column if not exists lost_at       timestamptz,
  add column if not exists source        text not null default 'system',
  add column if not exists metadata      jsonb not null default '{}'::jsonb;

comment on column public.journeys.owner_user_id is 'Broker who owns the journey. Null = unassigned/org-owned.';
comment on column public.journeys.source        is 'What opened the journey: system | event | manual | backfill | import.';
comment on column public.journeys.completed_at  is 'Set when the journey reaches a WON terminal stage.';
comment on column public.journeys.lost_at       is 'Set when the journey reaches a LOST terminal stage.';
comment on column public.journeys.paused_at     is 'Set when the journey is paused/inactive; cleared on reopen.';

-- Exactly ONE canonical journey per (org, journey_type, entity). This is what
-- makes the event-driven subscriber (5.2) idempotent at the journey level: a
-- repeated "created" event can never open a second journey for the same entity.
create unique index if not exists journeys_entity_uniq
  on public.journeys (org_id, journey_type, entity_type, entity_id);

-- Hot reads: the Journey Center + cockpits filter by org + status, ordered by activity.
create index if not exists journeys_org_status_activity_idx
  on public.journeys (org_id, status, last_activity_at desc);
create index if not exists journeys_org_owner_idx
  on public.journeys (org_id, owner_user_id) where owner_user_id is not null;

-- Canonical status vocabulary. 'completed' and 'dropped' are LEGACY aliases
-- still written by src/lib/journey-intelligence/service.ts (advanceStage); they
-- are permitted here so this migration cannot break a live code path, and are
-- retired in Batch 5.5 when that service is migrated onto the canonical machine.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journeys_status_chk') then
    alter table public.journeys
      add constraint journeys_status_chk check (
        status in ('active','won','lost','paused','inactive','completed','dropped')
      ) not valid;   -- NOT VALID: 0 rows today, and it must never block a legacy write path
  end if;
end $$;

-- ── 2. journey_events — canonical append-only stage history ──────────────────
alter table public.journey_events
  add column if not exists source_event_id uuid references public.domain_events(id) on delete set null,
  add column if not exists actor_user_id   uuid references public.users(id) on delete set null,
  add column if not exists reason          text,
  add column if not exists evidence        jsonb not null default '{}'::jsonb;

comment on column public.journey_events.source_event_id is 'The domain_events row that caused this transition. Null = manual/UI transition.';
comment on column public.journey_events.evidence        is 'Why the machine moved: the payload/facts the transition was derived from.';

-- IDEMPOTENCY (B2): re-processing the same domain event must never append the
-- same transition twice. The kernel drain replays events on retry, so this is
-- the DB-enforced guarantee — not a code-level check.
create unique index if not exists journey_events_source_transition_uniq
  on public.journey_events (journey_id, source_event_id, to_stage)
  where source_event_id is not null;

-- History reads (journey timeline, velocity: stage changes in last 30d).
create index if not exists journey_events_journey_occurred_idx
  on public.journey_events (journey_id, occurred_at desc);
create index if not exists journey_events_org_entity_idx
  on public.journey_events (org_id, entity_type, entity_id, occurred_at desc);
