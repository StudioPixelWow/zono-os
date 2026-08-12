-- ============================================================================
-- ZONO — P6.0 Product Telemetry · ADDITIVE index migration.
-- STATUS: PROPOSED — NOT APPLIED. Requires explicit approval (migration gate).
--
-- Context: the canonical product-telemetry source is the EXISTING `domain_events`
-- table. It already carries the columns and MOST indexes P6.0 needs:
--   · domain_events_org_time_idx   (organization_id, occurred_at DESC)      → org+time  ✅
--   · domain_events_org_type_idx   (organization_id, event_type, occurred_at)→ module+time, event+time ✅
--   · domain_events_entity_idx     (organization_id, entity_type, entity_id)→ entity     ✅
--   · domain_events_idem_uniq  UNIQUE(organization_id, idempotency_key)     → dedup      ✅
--
-- This migration adds ONLY the two access paths those indexes do not cover, both
-- needed by the P6.0 read layer at scale:
--   1. USER-centric DAU/WAU/MAU  → (actor_user_id, occurred_at DESC)
--   2. CROSS-ORG platform window → (occurred_at DESC, event_type)
--
-- It is purely additive: NO table/column changes, NO data changes, NO RLS
-- changes, NO destructive operations. Telemetry reads run through the platform
-- service-role DAL (src/lib/telemetry/server/telemetry.ts); RLS on domain_events
-- is unchanged and untouched.
--
-- NOTE ON CONCURRENCY: on a large production table, prefer running each statement
-- as CREATE INDEX CONCURRENTLY *outside* a transaction (concurrently cannot run
-- inside the migration transaction). At current volume (tens of rows) a plain
-- CREATE INDEX is instantaneous and lock-trivial; the CONCURRENTLY variants are
-- documented below for when volume grows.
-- ============================================================================

-- 1. User-centric activity (DAU / WAU / MAU by distinct actor).
create index if not exists domain_events_actor_time_idx
  on public.domain_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

-- 2. Cross-organization time window scan (platform-wide Product Usage roll-up:
--    recent meaningful events across all orgs filtered by event_type + time).
create index if not exists domain_events_time_type_idx
  on public.domain_events (occurred_at desc, event_type);

-- ── Large-scale CONCURRENTLY variant (run manually, outside a txn) ───────────
-- create index concurrently if not exists domain_events_actor_time_idx
--   on public.domain_events (actor_user_id, occurred_at desc) where actor_user_id is not null;
-- create index concurrently if not exists domain_events_time_type_idx
--   on public.domain_events (occurred_at desc, event_type);

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop index if exists public.domain_events_actor_time_idx;
-- drop index if exists public.domain_events_time_type_idx;
