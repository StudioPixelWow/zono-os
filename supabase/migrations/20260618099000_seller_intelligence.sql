-- ============================================================================
-- ZONO — 0018 · Seller Intelligence OS
-- ----------------------------------------------------------------------------
-- A seller "digital twin": one intelligence profile per seller (scores, state,
-- trends, metrics, AI-ready narrative fields) plus missions, risks, touchpoints
-- and commitments. Reuses activity_events for the timeline. Org-scoped RLS.
-- Convention: org column is `org_id`.
-- ============================================================================

-- 1) seller_intelligence_profiles (1:1 with seller) --------------------------
create table public.seller_intelligence_profiles (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  seller_id                   uuid not null unique references public.sellers(id) on delete cascade,
  -- scores (0..100)
  seller_health_score         smallint not null default 0 check (seller_health_score between 0 and 100),
  seller_trust_score          smallint not null default 0 check (seller_trust_score between 0 and 100),
  seller_engagement_score     smallint not null default 0 check (seller_engagement_score between 0 and 100),
  seller_confidence_score     smallint not null default 0 check (seller_confidence_score between 0 and 100),
  seller_satisfaction_score   smallint not null default 0 check (seller_satisfaction_score between 0 and 100),
  seller_churn_risk_score     smallint not null default 0 check (seller_churn_risk_score between 0 and 100),
  seller_response_score       smallint not null default 0 check (seller_response_score between 0 and 100),
  seller_relationship_score   smallint not null default 0 check (seller_relationship_score between 0 and 100),
  -- state
  current_status              text not null default 'stable',
  current_stage               text,
  last_contact_at             timestamptz,
  next_best_action            text,
  intelligence_summary        text,
  -- trends ('up' | 'down' | 'flat')
  trust_trend                 text not null default 'flat',
  engagement_trend            text not null default 'flat',
  satisfaction_trend          text not null default 'flat',
  -- metrics
  days_since_last_contact     integer,
  meetings_count              integer not null default 0,
  calls_count                 integer not null default 0,
  reports_sent_count          integer not null default 0,
  reports_opened_count        integer not null default 0,
  properties_count            integer not null default 0,
  active_properties_count     integer not null default 0,
  -- AI-ready narrative fields (populated deterministically for now)
  ai_summary                  text,
  ai_risk_summary             text,
  ai_opportunity_summary      text,
  -- autonomous foundation
  autonomous_mode_enabled     boolean not null default false,
  allowed_auto_actions        jsonb not null default '[]'::jsonb,
  last_calculated_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- 2) seller_missions ---------------------------------------------------------
create table public.seller_missions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  seller_id     uuid not null references public.sellers(id) on delete cascade,
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

-- 3) seller_risks ------------------------------------------------------------
create table public.seller_risks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  seller_id          uuid not null references public.sellers(id) on delete cascade,
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

-- 4) seller_touchpoints ------------------------------------------------------
create table public.seller_touchpoints (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  seller_id           uuid not null references public.sellers(id) on delete cascade,
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

-- 5) seller_commitments ------------------------------------------------------
create table public.seller_commitments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  seller_id           uuid not null references public.sellers(id) on delete cascade,
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
create index sip_org_idx          on public.seller_intelligence_profiles(org_id);
create index sip_churn_idx         on public.seller_intelligence_profiles(seller_churn_risk_score);
create index sip_trust_idx         on public.seller_intelligence_profiles(seller_trust_score);
create index seller_missions_idx    on public.seller_missions(seller_id);
create index seller_risks_idx       on public.seller_risks(seller_id);
create index seller_touchpoints_idx on public.seller_touchpoints(seller_id);
create index seller_commitments_idx on public.seller_commitments(seller_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array[
    'seller_intelligence_profiles','seller_missions','seller_risks','seller_commitments'
  ];
begin
  foreach t in array tbls loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$I '
      || 'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — org-scoped for all five tables ---------------------------------------
do $$
declare t text;
  tbls text[] := array[
    'seller_intelligence_profiles','seller_missions','seller_risks',
    'seller_touchpoints','seller_commitments'
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
      || 'using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.seller_intelligence_profiles, public.seller_missions, public.seller_risks,
  public.seller_touchpoints, public.seller_commitments
  to authenticated;
grant all privileges on
  public.seller_intelligence_profiles, public.seller_missions, public.seller_risks,
  public.seller_touchpoints, public.seller_commitments
  to service_role;
