-- ============================================================================
-- ZONO OS 2.0 — STAGE 2 · Timeline as a Kernel Guarantee
-- ----------------------------------------------------------------------------
-- Makes activity_events the ONE canonical timeline read model that every domain
-- event projects into. We do NOT create another timeline system and we do NOT
-- delete any source ledger — we only harden the existing activity_events so the
-- Event Kernel can project idempotently, fan an event onto multiple related
-- entity timelines, carry provenance (source) and respect visibility.
--
-- Changes to public.activity_events (all additive / widening — safe, idempotent):
--   1. event_id     — the originating domain_events.id (idempotency anchor).
--   2. source       — provenance: 'kernel' | 'imperative' | 'backfill' | 'bridge'.
--   3. visibility   — 'internal' | 'private' | 'shared' | 'public' (portal safety).
--   4. entity_id / related_entity_id widened uuid → text (external_listing and
--      other non-uuid subjects can now have a timeline).
--   5. Partial UNIQUE (org_id, event_id, entity_type, entity_id) WHERE event_id
--      is not null — the idempotency guarantee: reprocessing an event (and each
--      of its related-entity projections) can never create a duplicate row.
--   6. Pagination/read indexes for the shared timeline reader.
--
-- domain_events needs no schema change: retry_count / error_summary /
-- processed_at / processing_status already implement the outbox state machine;
-- the 'processing' claim + dead-letter transitions are enforced in code.
-- ============================================================================

-- 1–3) New columns -----------------------------------------------------------
alter table public.activity_events
  add column if not exists event_id   uuid,
  add column if not exists source     text,
  add column if not exists visibility text not null default 'internal';

-- Constrain visibility to the known set (idempotent add).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activity_events_visibility_chk'
  ) then
    alter table public.activity_events
      add constraint activity_events_visibility_chk
      check (visibility in ('internal','private','shared','public'));
  end if;
end $$;

-- 4) Widen entity ids uuid → text so text-keyed subjects (external_listing,
--    integration connections, etc.) can carry a timeline. uuid casts cleanly.
do $$
begin
  if (select data_type from information_schema.columns
        where table_schema='public' and table_name='activity_events' and column_name='entity_id') = 'uuid' then
    alter table public.activity_events alter column entity_id type text using entity_id::text;
  end if;
  if (select data_type from information_schema.columns
        where table_schema='public' and table_name='activity_events' and column_name='related_entity_id') = 'uuid' then
    alter table public.activity_events alter column related_entity_id type text using related_entity_id::text;
  end if;
end $$;

-- 5) Idempotency guarantee: one row per (org, event, target timeline). Kernel
--    projections and deterministic backfill rows both flow through this key, so
--    repeated processing is a no-op. Imperative rows (event_id null) are exempt.
create unique index if not exists activity_events_event_projection_uniq
  on public.activity_events (org_id, event_id, entity_type, entity_id)
  where event_id is not null;

-- 6) Read/pagination indexes for the shared timeline reader (subject + related,
--    stable newest-first ordering, visibility & source filters).
create index if not exists activity_events_entity_time_idx
  on public.activity_events (org_id, entity_type, entity_id, occurred_at desc);
create index if not exists activity_events_related_time_idx
  on public.activity_events (org_id, related_entity_type, related_entity_id, occurred_at desc);
create index if not exists activity_events_visibility_idx
  on public.activity_events (org_id, visibility);
create index if not exists activity_events_event_id_idx
  on public.activity_events (event_id) where event_id is not null;

-- Backfill provenance for existing rows: everything already in the table was
-- written imperatively (logActivityEvent) before the kernel projector existed.
update public.activity_events set source = 'imperative' where source is null;
