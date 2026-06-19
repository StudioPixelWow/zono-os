-- ============================================================================
-- ZONO — 0027 · Inventory Acquisition OS
-- ----------------------------------------------------------------------------
-- Turns external market intelligence into a broker acquisition engine. One
-- acquisition profile per external listing + ranked actions + human review.
-- Org-scoped. No new providers, no scraping, no auto-contact, no auto-promote.
-- ============================================================================

-- 1) inventory_acquisition_profiles (one per external listing)
create table public.inventory_acquisition_profiles (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  external_listing_id         uuid not null references public.external_listings(id) on delete cascade,
  acquisition_score           smallint not null default 0,
  private_seller_score        smallint not null default 0,
  buyer_demand_score          smallint not null default 0,
  price_opportunity_score     smallint not null default 0,
  market_gap_score            smallint not null default 0,
  contactability_score        smallint not null default 0,
  broker_competition_score    smallint not null default 0,
  double_side_potential_score smallint not null default 0,
  acquisition_status          text not null default 'new',
  next_best_action            text,
  reason_summary              text,
  ai_summary                  text,
  ai_outreach_strategy        text,
  ai_risk_summary             text,
  metadata                    jsonb not null default '{}'::jsonb,
  last_calculated_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint inv_acq_profiles_uniq unique (organization_id, external_listing_id)
);
create index inv_acq_profiles_org_idx     on public.inventory_acquisition_profiles(organization_id);
create index inv_acq_profiles_listing_idx  on public.inventory_acquisition_profiles(external_listing_id);
create index inv_acq_profiles_status_idx    on public.inventory_acquisition_profiles(acquisition_status);
create index inv_acq_profiles_score_idx     on public.inventory_acquisition_profiles(acquisition_score desc);

-- 2) inventory_acquisition_actions
create table public.inventory_acquisition_actions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  acquisition_profile_id uuid not null references public.inventory_acquisition_profiles(id) on delete cascade,
  external_listing_id   uuid references public.external_listings(id) on delete cascade,
  action_type           text not null,
  title                 text not null,
  description           text,
  urgency_score         smallint not null default 0,
  impact_score          smallint not null default 0,
  confidence_score      smallint not null default 0,
  expected_outcome      text,
  status                text not null default 'open',
  related_task_id       uuid references public.tasks(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index inv_acq_actions_org_idx      on public.inventory_acquisition_actions(organization_id);
create index inv_acq_actions_profile_idx   on public.inventory_acquisition_actions(acquisition_profile_id);

-- 3) inventory_acquisition_reviews
create table public.inventory_acquisition_reviews (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  external_listing_id    uuid references public.external_listings(id) on delete cascade,
  acquisition_profile_id uuid references public.inventory_acquisition_profiles(id) on delete cascade,
  review_type            text not null,
  title                  text not null,
  reason                 text,
  confidence_score       smallint not null default 0,
  status                 text not null default 'pending',
  reviewed_by            uuid references public.users(id) on delete set null,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index inv_acq_reviews_org_idx     on public.inventory_acquisition_reviews(organization_id);
create index inv_acq_reviews_status_idx   on public.inventory_acquisition_reviews(status);

-- updated_at triggers
create trigger trg_inv_acq_profiles_updated before update on public.inventory_acquisition_profiles
  for each row execute function public.set_updated_at();
create trigger trg_inv_acq_actions_updated before update on public.inventory_acquisition_actions
  for each row execute function public.set_updated_at();

-- RLS — org-scoped
do $$
declare t text;
  tbls text[] := array['inventory_acquisition_profiles','inventory_acquisition_actions','inventory_acquisition_reviews'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.inventory_acquisition_profiles, public.inventory_acquisition_actions, public.inventory_acquisition_reviews
  to authenticated;
grant all privileges on
  public.inventory_acquisition_profiles, public.inventory_acquisition_actions, public.inventory_acquisition_reviews
  to service_role;
