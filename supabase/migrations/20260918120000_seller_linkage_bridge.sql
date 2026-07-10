-- ============================================================================
-- ZONO OS 2.0 — Stage 0.3 · Seller linkage migration (ADDITIVE, reversible).
-- Decision: property_sellers is the CANONICAL seller↔property relationship
-- (multi-seller, roles). Legacy properties.seller_id becomes compatibility-only:
-- it holds ONE primary seller and is kept in sync (never used to represent
-- co-owners). This migration backfills BOTH directions so no reader is starved:
--   A) legacy → canonical: create a property_sellers link for any property that
--      has a legacy seller_id but no canonical link.
--   B) canonical → legacy: set the legacy primary from the canonical link for
--      any property whose legacy column is null (fixes the current starvation of
--      the ~9 modules still reading properties.seller_id).
-- Nothing is deleted. Idempotent (guards prevent duplicates). No fabrication:
-- only real, existing seller↔property rows are linked.
-- ============================================================================

-- A) legacy → canonical (only where the seller still exists in the same org).
insert into public.property_sellers
  (org_id, property_id, seller_id, relationship_type, is_primary, is_decision_maker, can_sign, status)
select p.org_id, p.id, p.seller_id, 'owner', true, true, true, 'active'
from public.properties p
where p.seller_id is not null
  and exists (select 1 from public.sellers s where s.id = p.seller_id and s.org_id = p.org_id)
  and not exists (
    select 1 from public.property_sellers ps
    where ps.property_id = p.id and ps.seller_id = p.seller_id and ps.relationship_type = 'owner'
  )
on conflict (org_id, property_id, seller_id, relationship_type) do nothing;

-- B) canonical → legacy (primary link wins; only fills nulls, never overwrites).
update public.properties p
set seller_id = sub.seller_id
from (
  select distinct on (property_id) property_id, seller_id
  from public.property_sellers
  where status = 'active'
  order by property_id, is_primary desc, created_at asc
) sub
where sub.property_id = p.id and p.seller_id is null;

-- ----------------------------------------------------------------------------
-- MIGRATION DIAGNOSTICS (run manually; read-only):
--   -- properties with a legacy seller but no canonical link (should be 0 after A)
--   select count(*) from public.properties p
--   where p.seller_id is not null and not exists (
--     select 1 from public.property_sellers ps where ps.property_id = p.id and ps.seller_id = p.seller_id);
--   -- properties with a canonical link but null legacy (should be 0 after B)
--   select count(*) from public.properties p
--   where p.seller_id is null and exists (
--     select 1 from public.property_sellers ps where ps.property_id = p.id and ps.status = 'active');
--   -- multi-seller properties (co-owners — legacy holds only the primary)
--   select property_id, count(*) from public.property_sellers
--   where status = 'active' group by property_id having count(*) > 1;
--   -- cross-org anomalies (must be 0)
--   select ps.id from public.property_sellers ps join public.properties p on p.id = ps.property_id
--   where p.org_id <> ps.org_id;
-- ----------------------------------------------------------------------------
