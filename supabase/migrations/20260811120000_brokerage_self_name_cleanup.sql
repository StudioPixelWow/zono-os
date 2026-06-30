-- ============================================================================
-- ZONO — Phase 26.13: Brokerage self-name office purge + seeded-broker dedupe.
-- ----------------------------------------------------------------------------
-- One-time data correction made IDEMPOTENT + FUTURE-SAFE so it can run on every
-- deploy without harm. The pre-26.12 registry created "offices" from a broker's
-- OWN name and fragmented each broker into one row per masked listing phone.
-- This cleans both, targeting ONLY the fabricated-data signatures:
--   (1) offices whose normalized_name EXACTLY equals a broker's normalized_name
--       → reject (reversible: status='rejected', not deleted) + unlink.
--   (2) listing-seeded, UNLICENSED candidate-agent fragments sharing
--       normalized_name + city → merge into one survivor (links preserved).
-- Real offices (brand/cluster names ≠ a broker name) and licensed/verified
-- brokers are never touched. Second run is a no-op.
--
-- NOTE (known limitation): two genuinely-distinct unlicensed brokers with the
-- exact same name in the same city would be merged. Acceptable for the masked-
-- phone fragmentation this fixes; licensed brokers are explicitly excluded.
-- ============================================================================
do $$
declare purged int := 0; merged int := 0;
begin
  -- ── (1) Reject self-name offices (name == a broker's own name) ─────────────
  update public.brokerage_offices o set
    status = 'rejected',
    metadata = coalesce(o.metadata, '{}'::jsonb) || '{"purged_reason":"self_name_office_26_13"}'::jsonb,
    last_seen_at = now()
  where o.status <> 'rejected'
    and o.normalized_name is not null
    and exists (select 1 from public.brokerage_agents a where a.normalized_name = o.normalized_name);
  get diagnostics purged = row_count;

  -- Unlink agents + listing links from any rejected office.
  update public.brokerage_agents a set
    office_id = null, resolution_method = null, resolution_confidence = null,
    resolution_explanation = 'unlinked: self-name office purge (26.13)', resolved_at = null
  where a.office_id in (select id from public.brokerage_offices where status = 'rejected');

  update public.brokerage_external_listing_links l set office_id = null
  where l.office_id in (select id from public.brokerage_offices where status = 'rejected');

  -- ── (2) Dedupe listing-seeded, unlicensed agent fragments (name + city) ────
  drop table if exists _bk_dedupe_map;
  create temp table _bk_dedupe_map as
  with ranked as (
    select a.id, a.normalized_name, coalesce(a.city, '') as city_k,
      row_number() over (
        partition by a.normalized_name, coalesce(a.city, '')
        order by (select count(*) from public.brokerage_external_listing_links l where l.agent_id = a.id) desc, a.id
      ) as rn
    from public.brokerage_agents a
    where coalesce(a.license_number, '') = ''          -- never merge licensed brokers
  ),
  surv as (select normalized_name, city_k, id as survivor_id from ranked where rn = 1)
  select a.id as dup_id, s.survivor_id
  from public.brokerage_agents a
  join surv s on s.normalized_name = a.normalized_name and s.city_k = coalesce(a.city, '')
  where a.id <> s.survivor_id and coalesce(a.license_number, '') = '';
  get diagnostics merged = row_count;

  -- Re-point listing links + evidence to the survivor, dedupe collisions, delete dups.
  update public.brokerage_external_listing_links l set agent_id = m.survivor_id
    from _bk_dedupe_map m where l.agent_id = m.dup_id;

  delete from public.brokerage_external_listing_links a
    using public.brokerage_external_listing_links b
    where a.agent_id = b.agent_id and a.external_listing_id = b.external_listing_id and a.ctid < b.ctid;

  update public.brokerage_office_evidence e set agent_id = m.survivor_id
    from _bk_dedupe_map m where e.agent_id = m.dup_id;

  delete from public.brokerage_agents a using _bk_dedupe_map m where a.id = m.dup_id;
  drop table if exists _bk_dedupe_map;

  raise notice 'brokerage cleanup 26.13: rejected % self-name offices, merged % duplicate agents', purged, merged;
end $$;
