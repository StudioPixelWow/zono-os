-- ============================================================================
-- ZONO — P4.1: durable source-post linkage for group-post history.
-- ----------------------------------------------------------------------------
-- Links each recorded group-post history row back to the originating
-- distribution_posts row. Closes the Phase 1 residual (history had no reference
-- to the queue post it came from) and enables the interaction → post → history →
-- lead attribution join used from P4.2 onward.
--
-- ADDITIVE, NULLABLE, BACKWARD COMPATIBLE:
--   • Adds one nullable uuid column with a FK to distribution_posts(id).
--   • ON DELETE SET NULL — deleting a source post never cascades away history; the
--     history row survives with source_post_id = NULL.
--   • NO historical backfill: existing distribution_group_posts rows stay NULL.
--     New confirmed-publish rows populate it going forward (recordGroupPost).
--   • Existing manual recordGroupPost callers are unaffected (column defaults NULL).
--
-- ROLLBACK: drop the index then the column (see below).
-- ============================================================================

alter table public.distribution_group_posts
  add column if not exists source_post_id uuid
  references public.distribution_posts(id) on delete set null;

create index if not exists dgp_source_post_idx
  on public.distribution_group_posts (source_post_id);

-- Rollback (manual):
--   drop index if exists public.dgp_source_post_idx;
--   alter table public.distribution_group_posts drop column if exists source_post_id;
