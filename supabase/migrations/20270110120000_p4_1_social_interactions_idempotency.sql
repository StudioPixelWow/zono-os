-- ============================================================================
-- ZONO — P4.1 (Facebook Interaction Ingestion): idempotency hardening.
-- ----------------------------------------------------------------------------
-- Adds a race-safe, DB-ENFORCED idempotency key for social interactions so that
-- duplicate or concurrent submissions of the SAME Facebook interaction within one
-- organization collapse to a single row (enabling ON CONFLICT ingestion in P4.2).
--
-- ADDITIVE & NON-DESTRUCTIVE:
--   • Creates a PARTIAL UNIQUE INDEX only. No column is added, no row is mutated
--     or deleted.
--   • public.social_interactions currently has NO writer anywhere in the codebase
--     (verified: only read/updated by recomputeSocialLeads; first producer arrives
--     in P4.2), so no existing row can conflict with this unique index.
--   • Different organizations may reuse the same external_comment_id — only
--     SAME-ORG duplicates are rejected (organization_id is part of the key).
--   • Interactions without an external_comment_id (NULL) are UNCONSTRAINED — many
--     NULLs are allowed (partial index WHERE external_comment_id IS NOT NULL);
--     those are handled by application-level dedup in P4.2.
--
-- ROLLBACK: drop index social_interactions_org_ext_comment_uq; (see below).
-- ============================================================================

create unique index if not exists social_interactions_org_ext_comment_uq
  on public.social_interactions (organization_id, external_comment_id)
  where external_comment_id is not null;

-- Rollback (manual):
--   drop index if exists public.social_interactions_org_ext_comment_uq;
