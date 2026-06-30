-- ============================================================================
-- ZONO — Phase 26.13c: purge person-name brokerage offices. ADDITIVE + idempotent.
-- ----------------------------------------------------------------------------
-- A brokerage office is legitimate ONLY if its name carries company evidence: a
-- known brand (RE/MAX, אנגלו סכסון, …) OR an office/company keyword (נדל"ן,
-- תיווך, נכסים, משרד, Group, Realty, …). Any office whose name has NEITHER is an
-- individual broker's personal name (e.g. "נדב רייזר", "אייל שמול") and must not
-- exist as an office. This rejects them (reversible: status='rejected', not
-- deleted), unlinks their agents + listing links, and rejects their candidates.
-- Future-safe: a real office (with a keyword) is never matched; second run is a
-- no-op. Mirrors src/lib/brokerage-data/office-name-guard.ts.
-- ============================================================================
do $$
declare purged int := 0; reassigned int := 0;
  kw text := '(נדל"?ן|נדלן|תיווך|נכסים|משרד|סוכנות|קבוצת|real ?estate|realty|properties|estate|agency|group|home|broker|re/?max|רימקס|רי/?מקס|אנגלו|century ?21|סנצ.?ורי|keller ?williams|\mkw\M|\mera\M|homeland|sotheby|coldwell)';
begin
  -- 1) Reject offices whose name has NO brand/office keyword (= a person name).
  update public.brokerage_offices o set
    status = 'rejected',
    metadata = coalesce(o.metadata, '{}'::jsonb) || '{"purged_reason":"candidate_name_is_individual_broker"}'::jsonb,
    last_seen_at = now()
  where o.status <> 'rejected'
    and coalesce(o.name, '') !~* kw;
  get diagnostics purged = row_count;

  -- 2) Unlink agents from rejected offices.
  update public.brokerage_agents a set
    office_id = null, resolution_method = null, resolution_confidence = null,
    resolution_explanation = 'unlinked: person-name office purge (26.13c)', resolved_at = null
  where a.office_id in (select id from public.brokerage_offices where status = 'rejected');
  get diagnostics reassigned = row_count;

  -- 3) Unlink listing links + reject matching candidates.
  update public.brokerage_external_listing_links l set office_id = null
  where l.office_id in (select id from public.brokerage_offices where status = 'rejected');

  update public.brokerage_office_candidates c set status = 'rejected', verified_office_id = null
  where c.status <> 'rejected'
    and (c.verified_office_id in (select id from public.brokerage_offices where status = 'rejected')
         or coalesce(c.office_name, '') !~* kw);

  raise notice 'person-name office purge (26.13c): rejected % offices, unlinked % agents', purged, reassigned;
end $$;
