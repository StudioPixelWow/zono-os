-- ============================================================================
-- ZONO — 0023 · Communication & Relationship Intelligence OS
-- ----------------------------------------------------------------------------
-- The communication brain. Reuses activity_events + communication_threads/
-- messages (already present). Adds four intelligence tables:
--   1) communication_intelligence_profiles — one per relationship/entity
--   2) communication_commitments           — promises made in communication
--   3) communication_followups             — follow-up intelligence
--   4) communication_insights              — AI-ready insights
-- All org-scoped (org_id + current_org_id()). No cross-org visibility.
-- ============================================================================

-- 1) communication_intelligence_profiles -------------------------------------
create table public.communication_intelligence_profiles (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  entity_type                 text not null,
  entity_id                   uuid not null,
  relationship_type           text,
  communication_health_score  smallint not null default 0,
  responsiveness_score        smallint not null default 0,
  sentiment_score             smallint not null default 50,
  followup_risk_score         smallint not null default 0,
  trust_impact_score          smallint not null default 0,
  engagement_impact_score     smallint not null default 0,
  momentum_impact_score       smallint not null default 0,
  last_contact_at             timestamptz,
  last_inbound_at             timestamptz,
  last_outbound_at            timestamptz,
  days_since_contact          integer,
  unanswered_messages_count   integer not null default 0,
  missed_followups_count      integer not null default 0,
  open_commitments_count      integer not null default 0,
  next_best_action            text,
  ai_summary                  text,
  ai_risk_summary             text,
  ai_recommendation_summary   text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint communication_profiles_uniq unique (org_id, entity_type, entity_id)
);
create index comm_profiles_org_idx     on public.communication_intelligence_profiles(org_id);
create index comm_profiles_entity_idx  on public.communication_intelligence_profiles(entity_type, entity_id);

-- 2) communication_commitments ------------------------------------------------
create table public.communication_commitments (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  entity_type          text not null,
  entity_id            uuid not null,
  related_entity_type  text,
  related_entity_id    uuid,
  commitment_text      text not null,
  promised_by_user_id  uuid references public.users(id) on delete set null,
  promised_to_type     text,
  promised_to_id       uuid,
  due_date             timestamptz,
  status               text not null default 'open',
  fulfilled_at         timestamptz,
  broken_at            timestamptz,
  impact_score         smallint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index comm_commitments_org_idx     on public.communication_commitments(org_id);
create index comm_commitments_entity_idx  on public.communication_commitments(entity_type, entity_id);
create index comm_commitments_status_idx  on public.communication_commitments(status);
create index comm_commitments_due_idx     on public.communication_commitments(due_date);

-- 3) communication_followups --------------------------------------------------
create table public.communication_followups (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  entity_type          text not null,
  entity_id            uuid not null,
  related_entity_type  text,
  related_entity_id    uuid,
  followup_type        text,
  title                text not null,
  reason               text,
  priority             text not null default 'medium',
  due_at               timestamptz,
  status               text not null default 'open',
  completed_at         timestamptz,
  related_task_id      uuid references public.tasks(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index comm_followups_org_idx     on public.communication_followups(org_id);
create index comm_followups_entity_idx  on public.communication_followups(entity_type, entity_id);
create index comm_followups_status_idx  on public.communication_followups(status);
create index comm_followups_due_idx     on public.communication_followups(due_at);

-- 4) communication_insights ---------------------------------------------------
create table public.communication_insights (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  entity_type         text not null,
  entity_id           uuid not null,
  insight_type        text not null,
  title               text not null,
  description         text,
  severity            text not null default 'info',
  confidence_score    smallint not null default 60,
  recommended_action  text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index comm_insights_org_idx     on public.communication_insights(org_id);
create index comm_insights_entity_idx  on public.communication_insights(entity_type, entity_id);
create index comm_insights_type_idx    on public.communication_insights(insight_type);

-- updated_at triggers (tables carrying updated_at) ---------------------------
create trigger trg_comm_profiles_updated before update on public.communication_intelligence_profiles
  for each row execute function public.set_updated_at();
create trigger trg_comm_commitments_updated before update on public.communication_commitments
  for each row execute function public.set_updated_at();
create trigger trg_comm_followups_updated before update on public.communication_followups
  for each row execute function public.set_updated_at();

-- RLS — org-scoped for all four tables ---------------------------------------
do $$
declare t text;
  tbls text[] := array[
    'communication_intelligence_profiles','communication_commitments',
    'communication_followups','communication_insights'
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
  public.communication_intelligence_profiles, public.communication_commitments,
  public.communication_followups, public.communication_insights
  to authenticated;
grant all privileges on
  public.communication_intelligence_profiles, public.communication_commitments,
  public.communication_followups, public.communication_insights
  to service_role;
