-- ============================================================================
-- ZONO — 0019 · Decision Intelligence OS (the Executive Brain)
-- ----------------------------------------------------------------------------
-- One org-level decision profile + ranked attention items, opportunity signals,
-- a priority queue and recommendations. Aggregates Property + Seller intelligence
-- into "what deserves attention now". Derived tables are regenerated on recalc.
-- Convention: org column is `org_id`. Org-scoped RLS (delete allowed for agent+
-- because these rows are system-generated and recomputed).
-- ============================================================================

-- 1) decision_intelligence_profiles (1 per org) -----------------------------
create table public.decision_intelligence_profiles (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null unique references public.organizations(id) on delete cascade,
  organization_health_score    smallint not null default 0 check (organization_health_score between 0 and 100),
  organization_risk_score       smallint not null default 0 check (organization_risk_score between 0 and 100),
  organization_growth_score     smallint not null default 0 check (organization_growth_score between 0 and 100),
  organization_execution_score  smallint not null default 0 check (organization_execution_score between 0 and 100),
  organization_attention_score  smallint not null default 0 check (organization_attention_score between 0 and 100),
  organization_revenue_score    smallint not null default 0 check (organization_revenue_score between 0 and 100),
  active_properties            integer not null default 0,
  active_sellers               integer not null default 0,
  high_risk_properties         integer not null default 0,
  high_risk_sellers            integer not null default 0,
  stalled_properties           integer not null default 0,
  stalled_sellers              integer not null default 0,
  overdue_tasks                integer not null default 0,
  overdue_commitments          integer not null default 0,
  top_priority_entity_id        uuid,
  top_priority_entity_type      text,
  top_priority_reason           text,
  executive_summary            text,
  risk_summary                 text,
  growth_summary               text,
  next_best_business_action     text,
  last_calculated_at           timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- 2) attention_items ---------------------------------------------------------
create table public.attention_items (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  entity_type               text not null,
  entity_id                 uuid not null,
  attention_score           smallint not null default 0,
  urgency_score             smallint not null default 0,
  impact_score              smallint not null default 0,
  confidence_score          smallint not null default 0,
  revenue_impact_score      smallint not null default 0,
  relationship_impact_score smallint not null default 0,
  churn_impact_score        smallint not null default 0,
  title                     text not null,
  reason                    text,
  recommended_action        text,
  expected_outcome          text,
  status                    text not null default 'open',
  detected_at               timestamptz not null default now(),
  resolved_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- 3) opportunity_signals -----------------------------------------------------
create table public.opportunity_signals (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  entity_type         text not null,
  entity_id           uuid not null,
  opportunity_score   smallint not null default 0,
  impact_score        smallint not null default 0,
  confidence_score    smallint not null default 0,
  title               text not null,
  description         text,
  recommended_action  text,
  status              text not null default 'open',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 4) decision_queue ----------------------------------------------------------
create table public.decision_queue (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null,
  entity_id       uuid not null,
  priority_score  smallint not null default 0,
  rank_position   integer not null default 0,
  title           text not null,
  reason          text,
  action_type     text,
  action_payload  jsonb not null default '{}'::jsonb,
  expected_impact text,
  status          text not null default 'open',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 5) decision_recommendations ------------------------------------------------
create table public.decision_recommendations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  entity_type         text,
  entity_id           uuid,
  recommendation_type text,
  title               text not null,
  description         text,
  urgency_score       smallint not null default 0,
  impact_score        smallint not null default 0,
  confidence_score    smallint not null default 0,
  expected_result     text,
  generated_at        timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- Indexes --------------------------------------------------------------------
create index dip_org_idx           on public.decision_intelligence_profiles(org_id);
create index attention_org_idx      on public.attention_items(org_id);
create index attention_entity_idx    on public.attention_items(entity_type, entity_id);
create index attention_status_idx    on public.attention_items(status);
create index attention_score_idx     on public.attention_items(attention_score desc);
create index opportunity_org_idx     on public.opportunity_signals(org_id);
create index opportunity_score_idx   on public.opportunity_signals(opportunity_score desc);
create index queue_org_idx           on public.decision_queue(org_id);
create index queue_rank_idx          on public.decision_queue(rank_position);
create index recommendation_org_idx  on public.decision_recommendations(org_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array['decision_intelligence_profiles','attention_items','opportunity_signals','decision_queue'];
begin
  foreach t in array tbls loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$I '
      || 'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — org-scoped (delete allowed for agent+ since rows are regenerated) -----
do $$
declare t text;
  tbls text[] := array[
    'decision_intelligence_profiles','attention_items','opportunity_signals',
    'decision_queue','decision_recommendations'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select to authenticated '
      || 'using (org_id = public.current_org_id());', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$I for insert to authenticated '
      || 'with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format(
      'create policy "%1$s_update" on public.%1$I for update to authenticated '
      || 'using (org_id = public.current_org_id() and public.has_min_role(''agent'')) '
      || 'with check (org_id = public.current_org_id());', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$I for delete to authenticated '
      || 'using (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.decision_intelligence_profiles, public.attention_items, public.opportunity_signals,
  public.decision_queue, public.decision_recommendations
  to authenticated;
grant all privileges on
  public.decision_intelligence_profiles, public.attention_items, public.opportunity_signals,
  public.decision_queue, public.decision_recommendations
  to service_role;
