-- ============================================================================
-- ZONO — Recommendation Intelligence OS (universal, explainable layer)
-- ----------------------------------------------------------------------------
-- A recommendation = target entity + recommended entity + reason + evidence +
-- confidence + expected business impact + next best action + status + review.
-- Deterministic only. No LLM. No auto-send. Consumes existing ZONO brains and
-- produces explainable recommendation records, packages, events, feedback and
-- map points. Org column convention here is `organization_id`.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) recommendation_profiles — one per entity that can receive recommendations
create table if not exists public.recommendation_profiles (
  id                                   uuid primary key default gen_random_uuid(),
  organization_id                      uuid not null references public.organizations(id) on delete cascade,
  entity_type                          text not null,
  entity_id                            uuid not null,
  recommendation_health_score          numeric not null default 0,
  recommendation_readiness_score       numeric not null default 0,
  recommendation_confidence_score      numeric not null default 0,
  open_recommendations_count           integer not null default 0,
  high_priority_recommendations_count  integer not null default 0,
  accepted_recommendations_count       integer not null default 0,
  rejected_recommendations_count       integer not null default 0,
  converted_recommendations_count      integer not null default 0,
  last_generated_at                    timestamptz,
  summary_hebrew                       text,
  next_best_recommendation_id          uuid,
  metadata                             jsonb not null default '{}'::jsonb,
  created_at                           timestamptz not null default now(),
  updated_at                           timestamptz not null default now(),
  constraint recommendation_profiles_entity_type_chk check (entity_type in (
    'buyer','seller','property','lead','match','deal','agent','acquisition',
    'community','locality','street','building','office'
  )),
  constraint recommendation_profiles_uniq unique (organization_id, entity_type, entity_id)
);

-- 2) recommendations — the universal recommendation table
create table if not exists public.recommendations (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  source_entity_type          text not null,
  source_entity_id            uuid not null,
  target_entity_type          text not null,
  target_entity_id            uuid,
  recommendation_type         text not null,
  title_hebrew                text not null,
  description_hebrew          text,
  reason_hebrew               text,
  next_best_action_hebrew     text,
  recommendation_score        numeric not null default 0,
  confidence_score            numeric not null default 0,
  urgency_score               numeric not null default 0,
  impact_score                numeric not null default 0,
  expected_revenue            numeric not null default 0,
  expected_commission         numeric not null default 0,
  expected_conversion_lift    numeric not null default 0,
  expected_days_to_value      integer,
  evidence                    jsonb not null default '[]'::jsonb,
  supporting_transactions     jsonb not null default '[]'::jsonb,
  supporting_properties       jsonb not null default '[]'::jsonb,
  supporting_buyers           jsonb not null default '[]'::jsonb,
  supporting_sellers          jsonb not null default '[]'::jsonb,
  supporting_deals            jsonb not null default '[]'::jsonb,
  supporting_geo              jsonb not null default '{}'::jsonb,
  supporting_market           jsonb not null default '{}'::jsonb,
  status                      text not null default 'new',
  review_status               text not null default 'pending',
  assigned_user_id            uuid references public.users(id) on delete set null,
  reviewed_by                 uuid references public.users(id) on delete set null,
  reviewed_at                 timestamptz,
  converted_at                timestamptz,
  expires_at                  timestamptz,
  generated_by                text not null default 'recommendation_engine',
  generation_reason           text,
  source_confidence           text not null default 'medium',
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint recommendations_type_chk check (recommendation_type in (
    'buyer_property','buyer_transaction_package','buyer_neighborhood','buyer_street',
    'buyer_financing_check','seller_pricing','seller_buyer_pool','seller_marketing_plan',
    'seller_transaction_package','property_buyer','property_pricing','property_marketing',
    'property_distribution','lead_property','lead_followup','lead_routing',
    'acquisition_seller_outreach','acquisition_property_research','deal_closing_action',
    'deal_negotiation_action','agent_street_focus','agent_locality_focus','office_growth_focus',
    'community_promotion','territory_focus','referral_opportunity','document_required',
    'signature_required','calculator_required','call_summary_required'
  )),
  constraint recommendations_status_chk check (status in (
    'new','reviewed','accepted','rejected','converted','expired','ignored'
  )),
  constraint recommendations_review_chk check (review_status in (
    'pending','approved','rejected','needs_more_data'
  )),
  constraint recommendations_source_conf_chk check (source_confidence in (
    'verified','high','medium','low','insufficient'
  ))
);

-- 3) recommendation_packages — human-reviewable bundles (never auto-sent)
create table if not exists public.recommendation_packages (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  package_type                text not null,
  entity_type                 text not null,
  entity_id                   uuid not null,
  title_hebrew                text,
  summary_hebrew              text,
  sections                    jsonb not null default '[]'::jsonb,
  recommendation_ids          uuid[] not null default '{}',
  included_properties         jsonb not null default '[]'::jsonb,
  included_transactions       jsonb not null default '[]'::jsonb,
  included_market_insights    jsonb not null default '[]'::jsonb,
  included_actions            jsonb not null default '[]'::jsonb,
  confidence_score            numeric not null default 0,
  package_score               numeric not null default 0,
  status                      text not null default 'draft',
  created_by                  uuid references public.users(id) on delete set null,
  approved_by                 uuid references public.users(id) on delete set null,
  sent_at                     timestamptz,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint recommendation_packages_type_chk check (package_type in (
    'buyer_package','seller_package','property_package','lead_package','agent_daily_package',
    'office_package','transaction_research_package','neighborhood_package','street_package'
  )),
  constraint recommendation_packages_status_chk check (status in (
    'draft','ready_for_review','approved','sent','archived'
  ))
);

-- 4) recommendation_events — lifecycle + learning
create table if not exists public.recommendation_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  recommendation_id   uuid references public.recommendations(id) on delete cascade,
  event_type          text not null,
  actor_user_id       uuid references public.users(id) on delete set null,
  entity_type         text,
  entity_id           uuid,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint recommendation_events_type_chk check (event_type in (
    'generated','viewed','approved','rejected','accepted','converted','sent',
    'ignored','expired','task_created','deal_created','feedback_positive','feedback_negative'
  ))
);

-- 5) recommendation_feedback — for future learning
create table if not exists public.recommendation_feedback (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  recommendation_id   uuid references public.recommendations(id) on delete cascade,
  user_id             uuid references public.users(id) on delete set null,
  feedback_type       text,
  rating              integer,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint recommendation_feedback_type_chk check (feedback_type is null or feedback_type in (
    'useful','not_useful','wrong','too_late','already_done','converted','irrelevant'
  ))
);

-- 6) recommendation_map_points — foundation for the Recommendation Map
create table if not exists public.recommendation_map_points (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  entity_type         text,
  entity_id           uuid,
  lat                 numeric,
  lng                 numeric,
  city_name           text,
  neighborhood_name   text,
  street              text,
  score               numeric not null default 0,
  recommendation_count integer not null default 0,
  opportunity_score   numeric not null default 0,
  demand_score        numeric not null default 0,
  supply_score        numeric not null default 0,
  confidence_score    numeric not null default 0,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint recommendation_map_points_entity_chk check (entity_type is null or entity_type in (
    'property','transaction','buyer_cluster','seller_cluster','street','building',
    'locality','opportunity','recommendation'
  ))
);

-- Indexes --------------------------------------------------------------------
create index if not exists rec_profiles_org_idx        on public.recommendation_profiles(organization_id);
create index if not exists rec_profiles_entity_idx     on public.recommendation_profiles(entity_type, entity_id);

create index if not exists rec_org_idx                 on public.recommendations(organization_id);
create index if not exists rec_source_idx              on public.recommendations(source_entity_type, source_entity_id);
create index if not exists rec_target_idx              on public.recommendations(target_entity_type, target_entity_id);
create index if not exists rec_type_idx                on public.recommendations(recommendation_type);
create index if not exists rec_status_idx              on public.recommendations(status);
create index if not exists rec_score_idx               on public.recommendations(recommendation_score desc);
create index if not exists rec_urgency_idx             on public.recommendations(urgency_score desc);
create index if not exists rec_impact_idx              on public.recommendations(impact_score desc);
create index if not exists rec_assigned_idx            on public.recommendations(assigned_user_id);

create index if not exists rec_pkg_org_idx             on public.recommendation_packages(organization_id);
create index if not exists rec_pkg_entity_idx          on public.recommendation_packages(entity_type, entity_id);
create index if not exists rec_pkg_status_idx          on public.recommendation_packages(status);

create index if not exists rec_events_org_idx          on public.recommendation_events(organization_id);
create index if not exists rec_events_rec_idx          on public.recommendation_events(recommendation_id);

create index if not exists rec_feedback_org_idx        on public.recommendation_feedback(organization_id);
create index if not exists rec_feedback_rec_idx        on public.recommendation_feedback(recommendation_id);

create index if not exists rec_map_org_idx             on public.recommendation_map_points(organization_id);
create index if not exists rec_map_entity_idx          on public.recommendation_map_points(entity_type, entity_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array[
    'recommendation_profiles','recommendations','recommendation_packages','recommendation_map_points'
  ];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$I '
      || 'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS ------------------------------------------------------------------------
-- recommendations: managers see all org rows; agents see rows assigned to them
-- or unassigned org rows. Writes allowed for agent+ (rows are system-generated
-- and acted on by the owning agent). No cross-org visibility anywhere.
alter table public.recommendations enable row level security;
drop policy if exists "recommendations_select" on public.recommendations;
create policy "recommendations_select" on public.recommendations for select to authenticated
  using (organization_id = public.current_org_id()
    and (public.has_min_role('manager') or assigned_user_id = auth.uid() or assigned_user_id is null));
drop policy if exists "recommendations_insert" on public.recommendations;
create policy "recommendations_insert" on public.recommendations for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));
drop policy if exists "recommendations_update" on public.recommendations;
create policy "recommendations_update" on public.recommendations for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id());
drop policy if exists "recommendations_delete" on public.recommendations;
create policy "recommendations_delete" on public.recommendations for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- Remaining tables: org-scoped read for all members; write for agent+.
do $$
declare t text;
  tbls text[] := array[
    'recommendation_profiles','recommendation_packages','recommendation_events',
    'recommendation_feedback','recommendation_map_points'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select to authenticated '
      || 'using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$I for insert to authenticated '
      || 'with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_update" on public.%1$I for update to authenticated '
      || 'using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) '
      || 'with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$I for delete to authenticated '
      || 'using (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

-- Grants ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.recommendation_profiles, public.recommendations, public.recommendation_packages,
  public.recommendation_events, public.recommendation_feedback, public.recommendation_map_points
  to authenticated;
grant all privileges on
  public.recommendation_profiles, public.recommendations, public.recommendation_packages,
  public.recommendation_events, public.recommendation_feedback, public.recommendation_map_points
  to service_role;
