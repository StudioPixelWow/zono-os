-- ============================================================================
-- ZONO OS 2.0 — STAGE 3 · Automation + Notifications Subscribers
-- ----------------------------------------------------------------------------
-- Makes the Event Kernel the ONLY source that activates downstream systems.
-- This migration adds two things — NO new engine, NO parallel queue:
--
--   1. domain_event_deliveries — a lightweight per-subscriber delivery ledger.
--      The outbox row (domain_events) carries ONE aggregate status; but Stage 3
--      fans each event to multiple subscribers (timeline / notification /
--      automation / recommendation / graph / memory). This ledger records the
--      outcome PER subscriber (done | duplicate | failed | skipped) with latency,
--      giving idempotency (unique event_id+subscriber) AND the PART-7 metrics
--      (processed / failed / duplicates / avg latency / last processed).
--
--   2. notifications.event_id — the notification subscriber had NO idempotency;
--      reprocessing an event could double-notify. A partial unique on
--      (org_id, event_id) makes kernel notifications idempotent.
--
-- Org column convention here follows each table: domain_event_deliveries uses
-- organization_id; notifications already uses org_id. RLS org-scoped. Idempotent.
-- ============================================================================

-- 1) Per-subscriber delivery ledger --------------------------------------------
create table if not exists public.domain_event_deliveries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  event_id         uuid not null,
  subscriber       text not null,           -- timeline | notification | automation | recommendation | graph | memory
  status           text not null,           -- done | duplicate | failed | skipped
  attempts         smallint not null default 1,
  latency_ms       integer,
  error            text,
  metadata         jsonb not null default '{}'::jsonb,
  processed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  constraint domain_event_deliveries_status_chk
    check (status in ('done','duplicate','failed','skipped')),
  -- One outcome per (event, subscriber) → idempotent reprocessing.
  constraint domain_event_deliveries_uniq unique (event_id, subscriber)
);

create index if not exists domain_event_deliveries_org_sub_idx
  on public.domain_event_deliveries (organization_id, subscriber, processed_at desc);
create index if not exists domain_event_deliveries_org_status_idx
  on public.domain_event_deliveries (organization_id, status);
create index if not exists domain_event_deliveries_event_idx
  on public.domain_event_deliveries (event_id);

alter table public.domain_event_deliveries enable row level security;

drop policy if exists "domain_event_deliveries_select" on public.domain_event_deliveries;
create policy "domain_event_deliveries_select" on public.domain_event_deliveries for select to authenticated
  using (organization_id = public.current_org_id());
-- Writes are service-role only (the outbox processor). No insert/update policy
-- for authenticated → append happens under the service role.

grant select on public.domain_event_deliveries to authenticated;
grant all privileges on public.domain_event_deliveries to service_role;

-- 2) Notification idempotency --------------------------------------------------
alter table public.notifications
  add column if not exists event_id uuid;

create unique index if not exists notifications_event_uniq
  on public.notifications (org_id, event_id)
  where event_id is not null;

create index if not exists notifications_org_created_idx
  on public.notifications (org_id, created_at desc);
