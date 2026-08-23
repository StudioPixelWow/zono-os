-- Office Intelligence 5.1 — Leak C fix: org-scope the agency_scores identity.
-- agency_scores is org-DEPENDENT (computed from the org's private territory stats,
-- deals and knowledge graph — agencyScoreCalculator), yet it was keyed unique(agency_id).
-- If an agency_id is ever shared across tenants (the intended convergence with the
-- national brokerage_* graph), two orgs collapse onto one score row: one org's upsert
-- (onConflict agency_id) overwrites the other's, and org-blind getScore() serves a score
-- computed from another tenant's private data. Every sibling agency_* table keys on
-- (organization_id, agency_id …); this brings agency_scores (and agency_profiles) in line.
alter table public.agency_scores drop constraint if exists agency_scores_agency_id_key;
alter table public.agency_scores add constraint agency_scores_org_agency_key unique (organization_id, agency_id);

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='agency_profiles' and column_name='organization_id') then
    alter table public.agency_profiles drop constraint if exists agency_profiles_agency_id_key;
    begin
      alter table public.agency_profiles add constraint agency_profiles_org_agency_key unique (organization_id, agency_id);
    exception when duplicate_table then null; end;
  end if;
end $$;
