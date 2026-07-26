-- ============================================================================
-- ZONO — P4.5: database-enforced social-lead idempotency (safe scheduled recompute).
-- ----------------------------------------------------------------------------
-- Guarantees that a given social interaction can back AT MOST ONE social lead per
-- organization — the final protection against overlapping/repeated recompute runs
-- creating duplicate social_leads. recomputeSocialLeads keeps its app-level
-- pre-check for efficiency and treats this index as the authority (INSERT then
-- catch unique_violation 23505).
--
-- COLUMN NAMES (verified against the repo):
--   public.social_leads.organization_id      uuid NOT NULL
--   public.social_leads.social_interaction_id uuid NULL (FK → social_interactions)
--
-- PARTIAL because social_interaction_id is nullable: interaction-linked leads are
-- deduped; any leads without an interaction (NULL) are unconstrained (multiple
-- NULLs allowed). This mirrors the P4.1 partial-index approach.
--
-- EXISTING-DATA SAFETY (IMPORTANT):
--   • Additive & non-destructive: creates ONE partial unique index. No column is
--     added, no row is mutated or deleted.
--   • CREATE UNIQUE INDEX is SELF-PROTECTING: if duplicate (organization_id,
--     social_interaction_id) rows already exist, it FAILS with 23505 and nothing
--     changes — it never silently deletes data. Run the PREFLIGHT below FIRST.
--
--   PREFLIGHT (run before applying; expect zero rows):
--     select organization_id, social_interaction_id, count(*)
--       from public.social_leads
--       where social_interaction_id is not null
--       group by 1, 2 having count(*) > 1;
--
--   If the preflight returns rows, DO NOT force this migration. Report the
--   duplicate groups and apply a deterministic remediation separately (e.g. keep
--   the most-progressed row per group — converted > qualified > reviewed > new,
--   tie-break on earliest created_at — and delete the rest) under review. This
--   migration intentionally does not delete anything.
--
-- ROLLBACK: drop index social_leads_org_interaction_uq; (see below).
-- ============================================================================

create unique index if not exists social_leads_org_interaction_uq
  on public.social_leads (organization_id, social_interaction_id)
  where social_interaction_id is not null;

-- Rollback (manual):
--   drop index if exists public.social_leads_org_interaction_uq;
