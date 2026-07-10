-- ============================================================================
-- ZONO OS 2.0 — STAGE 4 · BATCH 4.4 · Canonical AI Memory
-- ----------------------------------------------------------------------------
-- CANONICAL DECISION: public.ai_memory is THE single canonical durable memory
-- store. We EXTEND it (additive) with the Stage-4 scopes / lifecycle / provenance
-- fields rather than creating a competing table. The other memory concepts are
-- demoted to compatibility / backfill inputs or current-state projections:
--   • zono_org_memory / zono_org_memory_events → legacy/compat + backfill source
--   • intelligence profiles                    → current-state projections (not memory)
--   • domain_events                            → evidence/provenance (not memory)
--   • Ask ZONO state                           → conversation store (scope=conversation)
--
-- Every canonical memory carries: scope, entity refs, a concise fact + a
-- normalized fact + a stable identity key, provenance (explicit|derived|inferred),
-- sensitivity, confidence, validity window, supersession chain, and the source
-- domain event. Idempotency + "one active per identity" are enforced by a partial
-- unique index on (organization_id, identity_key) WHERE active. Existing rows are
-- untouched (all new columns nullable/defaulted; legacy rows have identity_key NULL
-- so they're exempt from the new unique index). RLS is NOT changed here — the
-- existing ai_memory policies (visibility private|office|organization|system +
-- user_id) remain the privacy gate.
-- ============================================================================

alter table public.ai_memory
  add column if not exists scope_type          text not null default 'organization', -- organization | user | entity | conversation
  add column if not exists entity_type         text,
  add column if not exists entity_id           text,
  add column if not exists conversation_id     uuid,
  add column if not exists fact                text,
  add column if not exists normalized_fact     text,
  add column if not exists normalized_fact_key text,        -- the dimension (e.g. "budget") — stable across values
  add column if not exists identity_key        text,        -- deterministic identity for idempotency + supersession
  add column if not exists source_event_id     uuid,
  add column if not exists source_entity_refs  jsonb not null default '[]'::jsonb,
  add column if not exists sensitivity         text not null default 'internal',      -- normal | internal | confidential | restricted
  add column if not exists explicit_or_inferred text not null default 'inferred',     -- explicit | derived | inferred
  add column if not exists valid_from          timestamptz not null default now(),
  add column if not exists valid_to            timestamptz,
  add column if not exists last_confirmed_at   timestamptz,
  add column if not exists superseded_by       uuid,
  add column if not exists active              boolean not null default true;

-- Constrain the controlled vocabularies (idempotent).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_scope_chk') then
    alter table public.ai_memory add constraint ai_memory_scope_chk
      check (scope_type in ('organization','user','entity','conversation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_provenance_chk') then
    alter table public.ai_memory add constraint ai_memory_provenance_chk
      check (explicit_or_inferred in ('explicit','derived','inferred'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_sensitivity_chk') then
    alter table public.ai_memory add constraint ai_memory_sensitivity_chk
      check (sensitivity in ('normal','internal','confidential','restricted'));
  end if;
end $$;

-- Backfill `active` from the existing status enum for legacy rows.
update public.ai_memory set active = (status = 'active') where identity_key is null;

-- ONE active memory per stable identity → idempotent ingestion + clean supersession.
create unique index if not exists ai_memory_identity_active_uniq
  on public.ai_memory (organization_id, identity_key)
  where active and identity_key is not null;

-- Read paths: entity memory, scope, provenance, source event.
create index if not exists ai_memory_entity_idx
  on public.ai_memory (organization_id, entity_type, entity_id) where active;
create index if not exists ai_memory_scope_idx
  on public.ai_memory (organization_id, scope_type) where active;
create index if not exists ai_memory_source_event_idx
  on public.ai_memory (source_event_id) where source_event_id is not null;
