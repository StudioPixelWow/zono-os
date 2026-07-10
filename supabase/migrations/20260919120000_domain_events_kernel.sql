-- ============================================================================
-- ZONO OS 2.0 — Stage 1 · Event Kernel · domain_events store (ADDITIVE).
-- The durable propagation backbone. Every major business mutation emits one
-- append-only, org-scoped, typed domain event here. This is NOT a replacement
-- for domain tables — it is the spine subscribers (timeline, automation,
-- notifications, search, graph, memory) will consume in later stages.
-- Append-only: authenticated may INSERT (own org) + SELECT (own org); no
-- UPDATE/DELETE for app users. Processing/retry is done by the service role.
-- Idempotency via a unique idempotency_key (nullable = no dedup requested).
-- ============================================================================
create table if not exists public.domain_events (
  id                 uuid primary key default gen_random_uuid(),
  event_type         text not null,
  event_version      smallint not null default 1,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  actor_user_id      uuid references public.users(id) on delete set null,
  entity_type        text not null,
  entity_id          text not null,
  correlation_id     uuid,
  causation_id       uuid,
  payload            jsonb not null default '{}'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  idempotency_key    text,
  occurred_at        timestamptz not null default now(),
  processed_at       timestamptz,
  processing_status  text not null default 'pending',   -- pending | processing | done | failed
  retry_count        smallint not null default 0,
  error_summary      text,
  created_at         timestamptz not null default now()
);

-- Idempotency: one event per key (per org). NULL keys are unconstrained.
create unique index if not exists domain_events_idem_uniq
  on public.domain_events (organization_id, idempotency_key)
  where idempotency_key is not null;

-- Read/scan patterns.
create index if not exists domain_events_org_time_idx   on public.domain_events (organization_id, occurred_at desc);
create index if not exists domain_events_org_type_idx   on public.domain_events (organization_id, event_type, occurred_at desc);
create index if not exists domain_events_entity_idx     on public.domain_events (organization_id, entity_type, entity_id);
-- Outbox scan for subscribers (only unprocessed rows).
create index if not exists domain_events_pending_idx    on public.domain_events (processing_status, occurred_at)
  where processing_status in ('pending', 'processing', 'failed');

alter table public.domain_events enable row level security;

-- Scoped read for org members.
drop policy if exists "domain_events_select" on public.domain_events;
create policy "domain_events_select" on public.domain_events for select to authenticated
  using (organization_id = public.current_org_id());

-- Append-only insert (own org). No UPDATE/DELETE for app users (service role bypasses RLS).
drop policy if exists "domain_events_insert" on public.domain_events;
create policy "domain_events_insert" on public.domain_events for insert to authenticated
  with check (organization_id = public.current_org_id());
