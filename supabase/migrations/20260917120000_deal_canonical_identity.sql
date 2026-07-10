-- ============================================================================
-- ZONO OS 2.0 — Stage 0.1 · Canonical Deal Identity (ADDITIVE, reversible).
-- Decision: public.deals is the ONE canonical Deal. deal_profiles becomes a 1:1
-- intelligence projection linked by deal_profiles.deal_id (column already
-- exists). This migration only enforces the 1:1 invariant and speeds lookups.
-- No data merge here (the TS reconcile layer links/creates rows using verified
-- relationships only, and flags nothing ambiguous). Reversible by dropping the
-- two indexes.
-- ============================================================================

-- One projection per canonical deal (nulls allowed = match-derived, not yet linked).
create unique index if not exists deal_profiles_deal_id_uniq
  on public.deal_profiles (deal_id)
  where deal_id is not null;

-- Fast canonical<->projection joins.
create index if not exists deal_profiles_deal_id_idx
  on public.deal_profiles (deal_id);

-- ----------------------------------------------------------------------------
-- MIGRATION DIAGNOSTICS (run manually; read-only — nothing is merged by this file):
--   -- canonical deals total
--   select count(*) from public.deals where org_id = :org;
--   -- projections total / linked / unlinked
--   select count(*) filter (where deal_id is not null) as linked,
--          count(*) filter (where deal_id is null)     as unlinked,
--          count(*) as total
--   from public.deal_profiles where organization_id = :org;
--   -- canonical open deals with NO projection (must be surfaced by Deals OS)
--   select d.id from public.deals d
--   where d.org_id = :org and d.status = 'open'
--     and not exists (select 1 from public.deal_profiles p where p.deal_id = d.id);
--   -- duplicate-projection candidates (should be 0 after the unique index)
--   select deal_id, count(*) from public.deal_profiles
--   where deal_id is not null group by deal_id having count(*) > 1;
-- ----------------------------------------------------------------------------
