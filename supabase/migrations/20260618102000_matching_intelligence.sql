-- ============================================================================
-- ZONO — 0021 · Matching Intelligence OS (the Deal Brain)
-- ----------------------------------------------------------------------------
-- A "match" is a deal twin: buyer + property + seller + timing + readiness +
-- trust + momentum + risk + probability. One profile per (buyer, property).
-- Reuses activity_events + the existing matching_results (raw scoring) without
-- duplicating it. Org-scoped RLS. Convention: org column is `org_id`.
-- ============================================================================

-- 1) match_intelligence_profiles (1 per buyer×property) ---------------------
create table public.match_intelligence_profiles (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  buyer_id                    uuid not null references public.buyers(id) on delete cascade,
  property_id                 uuid not null references public.properties(id) on delete cascade,
  seller_id                   uuid references public.sellers(id) on delete set null,
  compatibility_score         smallint not null default 0 check (compatibility_score between 0 and 100),
  readiness_score             smallint not null default 0 check (readiness_score between 0 and 100),
  engagement_score            smallint not null default 0 check (engagement_score between 0 and 100),
  trust_score                 smallint not null default 0 check (trust_score between 0 and 100),
  timing_score                smallint not null default 0 check (timing_score between 0 and 100),
  momentum_score              smallint not null default 0 check (momentum_score between 0 and 100),
  risk_score                  smallint not null default 0 check (risk_score between 0 and 100),
  closing_probability         smallint not null default 0 check (closing_probability between 0 and 100),
  opportunity_score           smallint not null default 0 check (opportunity_score between 0 and 100),
  revenue_score               smallint not null default 0 check (revenue_score between 0 and 100),
  urgency_score               smallint not null default 0 check (urgency_score between 0 and 100),
  match_status                text not null default 'active',
  match_stage                 text not null default 'candidate',
  next_best_action            text,
  primary_blocker             text,
  strongest_advantage         text,
  estimated_deal_value        bigint,
  estimated_commission        bigint,
  intelligence_summary        text,
  ai_summary                  text,
  ai_risk_summary             text,
  ai_recommendation_summary   text,
  last_calculated_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint match_profiles_uniq unique (org_id, buyer_id, property_id)
);

-- 2) match_risks -------------------------------------------------------------
create table public.match_risks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  match_id           uuid not null references public.match_intelligence_profiles(id) on delete cascade,
  risk_type          text,
  severity           text not null default 'medium',
  title              text not null,
  description        text,
  recommended_action text,
  status             text not null default 'open',
  detected_at        timestamptz not null default now(),
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3) match_objections --------------------------------------------------------
create table public.match_objections (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  match_id            uuid not null references public.match_intelligence_profiles(id) on delete cascade,
  objection_type      text,
  severity            text not null default 'medium',
  description         text,
  resolved            boolean not null default false,
  resolution_action   text,
  resolved_at         timestamptz,
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 4) match_opportunities -----------------------------------------------------
create table public.match_opportunities (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  match_id             uuid not null references public.match_intelligence_profiles(id) on delete cascade,
  opportunity_score    smallint not null default 0,
  revenue_score        smallint not null default 0,
  urgency_score        smallint not null default 0,
  estimated_deal_value bigint,
  estimated_commission bigint,
  recommended_action   text,
  status               text not null default 'open',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 5) revenue_signals ---------------------------------------------------------
create table public.revenue_signals (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  match_id                    uuid references public.match_intelligence_profiles(id) on delete cascade,
  estimated_commission        bigint not null default 0,
  expected_revenue            bigint not null default 0,
  confidence                  smallint not null default 0,
  probability_weighted_revenue bigint not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Indexes --------------------------------------------------------------------
create index mip_org_idx          on public.match_intelligence_profiles(org_id);
create index mip_buyer_idx         on public.match_intelligence_profiles(buyer_id);
create index mip_property_idx       on public.match_intelligence_profiles(property_id);
create index mip_seller_idx         on public.match_intelligence_profiles(seller_id);
create index mip_closing_idx        on public.match_intelligence_profiles(closing_probability desc);
create index match_risks_idx        on public.match_risks(match_id);
create index match_objections_idx   on public.match_objections(match_id);
create index match_opportunities_idx on public.match_opportunities(match_id);
create index revenue_signals_org_idx on public.revenue_signals(org_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array['match_intelligence_profiles','match_risks','match_objections','match_opportunities','revenue_signals'];
begin
  foreach t in array tbls loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — org-scoped (delete allowed for agent+; matches are regenerated) -------
do $$
declare t text;
  tbls text[] := array['match_intelligence_profiles','match_risks','match_objections','match_opportunities','revenue_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.match_intelligence_profiles, public.match_risks, public.match_objections,
  public.match_opportunities, public.revenue_signals
  to authenticated;
grant all privileges on
  public.match_intelligence_profiles, public.match_risks, public.match_objections,
  public.match_opportunities, public.revenue_signals
  to service_role;
