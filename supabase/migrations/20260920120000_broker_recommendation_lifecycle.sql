-- ============================================================================
-- ZONO — Broker Intelligence · Recommendation Lifecycle (Broker OS · Phase 3)
-- ----------------------------------------------------------------------------
-- The shared Broker-Intelligence priority queue is computed LIVE from real data
-- (it does not persist recommendation rows). But the broker's DECISIONS on those
-- recommendations must persist and travel to every surface: Accept / Dismiss /
-- Snooze / Completed / Done-elsewhere / Reject. Nothing disappears silently.
--
-- We persist an APPEND-ONLY event log keyed by the recommendation's STABLE
-- identity `rec_key` = "entityType:entityId:actionClass" (see priority.recKey).
-- The current state of a recommendation = its most recent event. This same log
-- feeds Phase 4's learning loop (real historical outcomes, not AI guessing).
--
-- Org column convention: organization_id. RLS via current_org_id()/has_min_role.
-- Idempotent: safe to re-run.
-- ============================================================================

create table if not exists public.broker_recommendation_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- Stable recommendation identity ("entityType:entityId:actionClass").
  rec_key           text not null,
  -- Denormalized identity parts (for learning-loop aggregation + filtering).
  entity_type       text not null,
  entity_id         text not null,
  area              text,
  action_class      text,
  -- The lifecycle decision.
  action            text not null,
  -- For snooze: when the recommendation should resurface.
  snooze_until      timestamptz,
  -- Snapshot at decision time (fuels the learning loop — real outcomes).
  title             text,
  confidence        integer,
  priority          integer,
  note              text,
  actor_user_id     uuid references public.users(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint broker_recommendation_events_action_chk check (action in (
    'accepted','dismissed','snoozed','completed','done_elsewhere','rejected'
  ))
);

-- Latest-per-key lookups per org (drives queue filtering) + time-ordered reads.
create index if not exists broker_recommendation_events_org_key_idx
  on public.broker_recommendation_events (organization_id, rec_key, created_at desc);
create index if not exists broker_recommendation_events_org_created_idx
  on public.broker_recommendation_events (organization_id, created_at desc);
-- Learning-loop aggregation by outcome.
create index if not exists broker_recommendation_events_org_action_idx
  on public.broker_recommendation_events (organization_id, action);

-- Row-level security: strictly org-scoped; agents may read + append.
alter table public.broker_recommendation_events enable row level security;

drop policy if exists "broker_rec_events_select" on public.broker_recommendation_events;
create policy "broker_rec_events_select" on public.broker_recommendation_events for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "broker_rec_events_insert" on public.broker_recommendation_events;
create policy "broker_rec_events_insert" on public.broker_recommendation_events for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- Append-only by design: no update/delete policies (history is immutable).

grant select, insert on public.broker_recommendation_events to authenticated;
grant all privileges on public.broker_recommendation_events to service_role;
