-- ============================================================================
-- ZONO OS 2.0 — STAGE 4 · BATCH 4.3 · Incremental Knowledge Graph lifecycle
-- ----------------------------------------------------------------------------
-- CANONICAL DECISION: public.entity_relationships is the ONE live relationship
-- substrate. The graph_* tables remain analytics/query PROJECTIONS and the
-- universal-graph / relationship-graph libraries remain READERS/BUILDERS. We do
-- NOT create another graph table family.
--
-- The Event Kernel graph subscriber keeps this table fresh incrementally
-- (create / update / retire) instead of relying on 24h rebuilds. Stable edge
-- identity is the EXISTING unique key
--   (org_id, source_entity_type, source_entity_id,
--    target_entity_type, target_entity_id, relationship_type)
-- so repeated event processing upserts the same edge — never a duplicate.
--
-- This migration only ADDS lifecycle columns (additive, safe, idempotent):
--   • last_seen_at    — refreshed on every incremental touch (drift detection)
--   • valid_from      — when the relationship became active
--   • valid_to        — set when an edge is retired (history preserved, not deleted)
--   • source_event_id — provenance: the domain event that last wrote the edge
-- Existing readers are unaffected (all new columns are nullable/defaulted).
-- ============================================================================

alter table public.entity_relationships
  add column if not exists last_seen_at    timestamptz not null default now(),
  add column if not exists valid_from      timestamptz not null default now(),
  add column if not exists valid_to        timestamptz,
  add column if not exists source_event_id uuid;

-- Fast "active edges for entity" reads + reconciliation scans.
create index if not exists entity_relationships_active_idx
  on public.entity_relationships (org_id, status, last_seen_at desc);
create index if not exists entity_relationships_source_event_idx
  on public.entity_relationships (source_event_id) where source_event_id is not null;
