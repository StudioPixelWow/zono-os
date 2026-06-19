-- ============================================================================
-- ZONO — 0020 · Buyer Intelligence OS (the third brain)
-- ----------------------------------------------------------------------------
-- A buyer "digital twin": one intelligence profile per buyer (scores, journey
-- stage, metrics, insights, AI-ready fields) plus missions, risks, touchpoints,
-- objections and commitments. Reuses activity_events + entity_relationships.
-- Org-scoped RLS. Convention: org column is `org_id`.
-- ============================================================================

-- 1) buyer_intelligence_profiles (1:1 with buyer) ---------------------------
create table public.buyer_intelligence_profiles (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  buyer_id                    uuid not null unique references public.buyers(id) on delete cascade,
  buyer_health_score          smallint not null default 0 check (buyer_health_score between 0 and 100),
  buyer_readiness_score       smallint not null default 0 check (buyer_readiness_score between 0 and 100),
  buyer_engagement_score      smallint not null default 0 check (buyer_engagement_score between 0 and 100),
  buyer_qualification_score   smallint not null default 0 check (buyer_qualification_score between 0 and 100),
  buyer_trust_score           smallint not null default 0 check (buyer_trust_score between 0 and 100),
  buyer_financing_score       smallint not null default 0 check (buyer_financing_score between 0 and 100),
  buyer_momentum_score        smallint not null default 0 check (buyer_momentum_score between 0 and 100),
  buyer_conversion_probability smallint not null default 0 check (buyer_conversion_probability between 0 and 100),
  current_stage               text not null default 'new_lead',
  current_status              text not null default 'early',
  next_best_action            text,
  viewed_properties_count     integer not null default 0,
  visits_count                integer not null default 0,
  liked_properties_count      integer not null default 0,
  rejected_properties_count   integer not null default 0,
  offers_count                integer not null default 0,
  meetings_count              integer not null default 0,
  calls_count                 integer not null default 0,
  last_activity_at            timestamptz,
  last_visit_at               timestamptz,
  days_since_activity         integer,
  primary_objection           text,
  purchase_motivation         text,
  urgency_level               text,
  preferred_area_summary      text,
  intelligence_summary        text,
  ai_summary                  text,
  ai_risk_summary             text,
  ai_recommendation_summary   text,
  autonomous_mode_enabled     boolean not null default false,
  allowed_auto_actions        jsonb not null default '[]'::jsonb,
  last_calculated_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- 2) buyer_missions ----------------------------------------------------------
create table public.buyer_missions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  buyer_id      uuid not null references public.buyers(id) on delete cascade,
  title         text not null,
  description   text,
  status        text not null default 'active',
  priority      text not null default 'medium',
  target_metric text,
  target_value  numeric,
  current_value numeric not null default 0,
  due_date      timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3) buyer_risks -------------------------------------------------------------
create table public.buyer_risks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  buyer_id           uuid not null references public.buyers(id) on delete cascade,
  risk_type          text,
  severity           text not null default 'medium',
  title              text not null,
  description        text,
  recommended_action text,
  status             text not null default 'open',
  detected_at        timestamptz not null default now(),
  resolved_at        timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 4) buyer_touchpoints -------------------------------------------------------
create table public.buyer_touchpoints (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  buyer_id            uuid not null references public.buyers(id) on delete cascade,
  property_id         uuid references public.properties(id) on delete set null,
  touchpoint_type     text,
  direction           text not null default 'outbound',
  title               text,
  description         text,
  sentiment           text,
  impact_score        smallint not null default 0,
  trust_impact        smallint not null default 0,
  engagement_impact   smallint not null default 0,
  created_by_user_id  uuid references public.users(id) on delete set null,
  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- 5) buyer_objections --------------------------------------------------------
create table public.buyer_objections (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  buyer_id            uuid not null references public.buyers(id) on delete cascade,
  objection_type      text,
  severity            text not null default 'medium',
  title               text,
  description         text,
  resolved            boolean not null default false,
  resolved_at         timestamptz,
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 6) buyer_commitments -------------------------------------------------------
create table public.buyer_commitments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  buyer_id            uuid not null references public.buyers(id) on delete cascade,
  property_id         uuid references public.properties(id) on delete set null,
  title               text not null,
  description         text,
  promised_at         timestamptz not null default now(),
  due_date            timestamptz,
  fulfilled_at        timestamptz,
  status              text not null default 'open',
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Indexes --------------------------------------------------------------------
create index bip_org_idx           on public.buyer_intelligence_profiles(org_id);
create index bip_conversion_idx     on public.buyer_intelligence_profiles(buyer_conversion_probability);
create index bip_readiness_idx      on public.buyer_intelligence_profiles(buyer_readiness_score);
create index buyer_missions_idx      on public.buyer_missions(buyer_id);
create index buyer_risks_idx         on public.buyer_risks(buyer_id);
create index buyer_touchpoints_idx   on public.buyer_touchpoints(buyer_id);
create index buyer_objections_idx    on public.buyer_objections(buyer_id);
create index buyer_commitments_idx   on public.buyer_commitments(buyer_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array['buyer_intelligence_profiles','buyer_missions','buyer_risks','buyer_objections','buyer_commitments'];
begin
  foreach t in array tbls loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — org-scoped -----------------------------------------------------------
do $$
declare t text;
  tbls text[] := array[
    'buyer_intelligence_profiles','buyer_missions','buyer_risks',
    'buyer_touchpoints','buyer_objections','buyer_commitments'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.buyer_intelligence_profiles, public.buyer_missions, public.buyer_risks,
  public.buyer_touchpoints, public.buyer_objections, public.buyer_commitments
  to authenticated;
grant all privileges on
  public.buyer_intelligence_profiles, public.buyer_missions, public.buyer_risks,
  public.buyer_touchpoints, public.buyer_objections, public.buyer_commitments
  to service_role;
