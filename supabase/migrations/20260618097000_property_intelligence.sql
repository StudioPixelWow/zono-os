-- ============================================================================
-- ZONO — 0016 · Autonomous Property OS (Property Intelligence Center)
-- ----------------------------------------------------------------------------
-- Nine new tables that turn each property into an intelligent operating system:
-- an intelligence profile (scores + mission + autonomous-mode flags), reusable
-- success blueprints, missions, growth levers, risks, exposure channels, seller
-- touchpoints, calendar plans, and a score-change history.
--
-- Convention: org column is `org_id` (matches every existing table and the
-- current_org_id() RLS helper) — the spec's "organization_id" maps to this.
-- Category fields are text (+ jsonb for rules) to stay flexible; scores are
-- smallint 0..100. Standard org-scoped RLS; system blueprints (org_id null)
-- are readable by everyone.
-- ============================================================================

-- 1) Intelligence profile (1:1 with property) -------------------------------
create table public.property_intelligence_profiles (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references public.organizations(id) on delete cascade,
  property_id                uuid not null unique references public.properties(id) on delete cascade,
  blueprint_id               uuid,
  mission_type               text,
  mission_title              text,
  mission_description        text,
  target_sale_days           integer,
  target_price               bigint,
  target_leads               integer,
  target_visits              integer,
  target_offers              integer,
  health_score               smallint not null default 0 check (health_score between 0 and 100),
  success_score              smallint not null default 0 check (success_score between 0 and 100),
  risk_score                 smallint not null default 0 check (risk_score between 0 and 100),
  marketing_score            smallint not null default 0 check (marketing_score between 0 and 100),
  exposure_score             smallint not null default 0 check (exposure_score between 0 and 100),
  seller_trust_score         smallint not null default 0 check (seller_trust_score between 0 and 100),
  market_position_score      smallint not null default 0 check (market_position_score between 0 and 100),
  momentum_score             smallint not null default 0 check (momentum_score between 0 and 100),
  current_stage              text,
  next_best_action           text,
  intelligence_summary       text,
  autonomous_mode_enabled    boolean not null default false,
  allowed_auto_actions       jsonb not null default '[]'::jsonb,
  approval_required_actions  jsonb not null default '[]'::jsonb,
  last_calculated_at         timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- 2) Blueprints (system defaults have org_id null) --------------------------
create table public.property_blueprints (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references public.organizations(id) on delete cascade,
  name                text not null,
  property_type       text,
  deal_type           text,
  exclusivity_type    text,
  target_days         integer,
  description         text,
  stages              jsonb not null default '[]'::jsonb,
  required_actions    jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  risk_rules          jsonb not null default '[]'::jsonb,
  scoring_rules       jsonb not null default '{}'::jsonb,
  calendar_rules      jsonb not null default '[]'::jsonb,
  is_system_default   boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- the profile FK references blueprints; add it now that the table exists
alter table public.property_intelligence_profiles
  add constraint property_intelligence_profiles_blueprint_fk
  foreign key (blueprint_id) references public.property_blueprints(id) on delete set null;

-- 3) Missions ----------------------------------------------------------------
create table public.property_missions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  property_id   uuid not null references public.properties(id) on delete cascade,
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

-- 4) Levers ------------------------------------------------------------------
create table public.property_levers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  property_id       uuid not null references public.properties(id) on delete cascade,
  lever_type        text,
  title             text not null,
  description       text,
  expected_impact   text,
  impact_score      smallint not null default 0,
  effort_score      smallint not null default 0,
  urgency_score     smallint not null default 0,
  confidence_score  smallint not null default 0,
  status            text not null default 'suggested',
  related_task_id   uuid references public.tasks(id) on delete set null,
  related_meeting_id uuid references public.meetings(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 5) Risks -------------------------------------------------------------------
create table public.property_risks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  property_id        uuid not null references public.properties(id) on delete cascade,
  risk_type          text,
  severity           text not null default 'medium',
  title              text not null,
  description        text,
  detected_at        timestamptz not null default now(),
  resolved_at        timestamptz,
  status             text not null default 'open',
  recommended_action text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 6) Exposure channels -------------------------------------------------------
create table public.property_exposure_channels (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  property_id      uuid not null references public.properties(id) on delete cascade,
  channel          text not null,
  status           text not null default 'not_published',
  published_url    text,
  published_at     timestamptz,
  last_checked_at  timestamptz,
  views_count      integer not null default 0,
  leads_count      integer not null default 0,
  clicks_count     integer not null default 0,
  engagement_score smallint not null default 0,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (property_id, channel)
);

-- 7) Seller touchpoints ------------------------------------------------------
create table public.property_seller_touchpoints (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  seller_id           uuid references public.sellers(id) on delete set null,
  touchpoint_type     text,
  title               text,
  description         text,
  direction           text not null default 'outbound',
  sentiment           text,
  seller_response     text,
  trust_impact_score  smallint not null default 0,
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- 8) Calendar plans ----------------------------------------------------------
create table public.property_calendar_plans (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  property_id        uuid not null references public.properties(id) on delete cascade,
  title              text not null,
  description        text,
  plan_type          text,
  suggested_date     timestamptz,
  scheduled_event_id uuid references public.meetings(id) on delete set null,
  status             text not null default 'suggested',
  priority           text not null default 'medium',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 9) Score events (history) --------------------------------------------------
create table public.property_score_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  score_type  text not null,
  old_score   smallint,
  new_score   smallint,
  reason      text,
  created_at  timestamptz not null default now()
);

-- Indexes --------------------------------------------------------------------
create index pip_org_idx        on public.property_intelligence_profiles(org_id);
create index pip_health_idx     on public.property_intelligence_profiles(health_score);
create index blueprints_org_idx on public.property_blueprints(org_id);
create index missions_prop_idx  on public.property_missions(property_id);
create index levers_prop_idx    on public.property_levers(property_id);
create index risks_prop_idx     on public.property_risks(property_id);
create index exposure_prop_idx  on public.property_exposure_channels(property_id);
create index touchpoints_prop_idx on public.property_seller_touchpoints(property_id);
create index calendar_prop_idx  on public.property_calendar_plans(property_id);
create index score_events_prop_idx on public.property_score_events(property_id);

-- updated_at triggers (tables that have updated_at) --------------------------
do $$
declare t text;
  tbls text[] := array[
    'property_intelligence_profiles','property_blueprints','property_missions',
    'property_levers','property_risks','property_exposure_channels',
    'property_calendar_plans'
  ];
begin
  foreach t in array tbls loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$I '
      || 'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — standard org-scoped policies for all nine tables ---------------------
do $$
declare t text;
  tbls text[] := array[
    'property_intelligence_profiles','property_missions','property_levers',
    'property_risks','property_exposure_channels','property_seller_touchpoints',
    'property_calendar_plans','property_score_events'
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

-- Blueprints: org rows OR system defaults (org_id null) are readable ----------
alter table public.property_blueprints enable row level security;

create policy "property_blueprints_select" on public.property_blueprints
  for select to authenticated
  using (org_id is null or org_id = public.current_org_id());

create policy "property_blueprints_insert" on public.property_blueprints
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent'));

create policy "property_blueprints_update" on public.property_blueprints
  for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('manager'))
  with check (org_id = public.current_org_id());

create policy "property_blueprints_delete" on public.property_blueprints
  for delete to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('manager'));

-- Grants ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.property_intelligence_profiles, public.property_blueprints,
  public.property_missions, public.property_levers, public.property_risks,
  public.property_exposure_channels, public.property_seller_touchpoints,
  public.property_calendar_plans, public.property_score_events
  to authenticated;
grant all privileges on
  public.property_intelligence_profiles, public.property_blueprints,
  public.property_missions, public.property_levers, public.property_risks,
  public.property_exposure_channels, public.property_seller_touchpoints,
  public.property_calendar_plans, public.property_score_events
  to service_role;

-- System default blueprints (org_id null) ------------------------------------
-- Light metadata here; the rich Hebrew action/mission/risk content lives in
-- the application blueprint engine and is keyed off (property_type, deal_type,
-- exclusivity_type, name). target_days drives the sale-time mission.
insert into public.property_blueprints
  (org_id, name, property_type, deal_type, exclusivity_type, target_days, description, is_system_default)
values
  (null, 'דירת יד שנייה רגילה', 'apartment',        'sale', 'open',      90,  'בלופרינט ברירת מחדל לדירת יד שנייה ללא בלעדיות.', true),
  (null, 'נכס בבלעדיות',         null,               'sale', 'exclusive', 60,  'בלופרינט מואץ לנכס בבלעדיות — מוכנות שיווק מהירה ודיווח מוכר שוטף.', true),
  (null, 'פנטהאוז / יוקרה',      'penthouse',        'sale', 'exclusive', 75,  'בלופרינט יוקרה — דגש על תוכן פרימיום וקהל ממוקד.', true),
  (null, 'דירת גן',              'garden_apartment', 'sale', 'open',      80,  'בלופרינט לדירת גן.', true),
  (null, 'פרויקט חדש',           'apartment',        'sale', 'open',      120, 'בלופרינט לפרויקט חדש מקבלן.', true),
  (null, 'השכרה',                'apartment',        'rent', 'open',      30,  'בלופרינט להשכרה — מחזור מהיר.', true),
  (null, 'נכס מסחרי',            'commercial',       'sale', 'open',      120, 'בלופרינט לנכס מסחרי.', true),
  (null, 'מגרש / קרקע',          'land',             'sale', 'open',      150, 'בלופרינט למגרש / קרקע.', true);
