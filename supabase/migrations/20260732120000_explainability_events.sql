-- ============================================================================
-- ZONO — Universal Explainability events (Phase 25.3, additive + idempotent).
-- ----------------------------------------------------------------------------
-- An append-only audit of WHY a score was what it was. Every row is produced by
-- a deterministic engine from real counted data — this table only STORES the
-- explanation so it can be shown ("למה?") and audited. No fabricated reasons.
-- Org-isolated via RLS. Safe to run on any DB state.
-- Conventions: public.current_org_id(), public.has_min_role().
-- ============================================================================

create table if not exists public.explainability_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  entity_type  text not null,                  -- market_locality | territory | property | buyer_match | seller | opportunity
  entity_id    text,                           -- nullable (e.g. locality name / uuid)
  score_type   text not null,                  -- market_opportunity | territory | property_exposure | buyer_match | seller_confidence | opportunity
  score_value  numeric not null,               -- the explained score
  band         text,                           -- optional band label
  reason       text not null,                  -- one human, data-derived reason
  impact       text not null default 'neutral',-- positive | negative | neutral
  evidence     text,                           -- optional concrete counts/deltas
  source       text,                           -- data source label
  created_at   timestamptz not null default now()
);

create index if not exists explainability_events_org_idx
  on public.explainability_events(org_id);
create index if not exists explainability_events_entity_idx
  on public.explainability_events(org_id, entity_type, entity_id);
create index if not exists explainability_events_score_idx
  on public.explainability_events(org_id, score_type, created_at desc);

alter table public.explainability_events enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='explainability_events' and policyname='explainability_events_select') then
    create policy "explainability_events_select" on public.explainability_events
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='explainability_events' and policyname='explainability_events_insert') then
    create policy "explainability_events_insert" on public.explainability_events
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
end $$;

grant select, insert on public.explainability_events to authenticated;
grant all privileges on public.explainability_events to service_role;
