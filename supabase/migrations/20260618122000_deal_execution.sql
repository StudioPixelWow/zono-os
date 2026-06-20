-- ============================================================================
-- ZONO — 0039 · Deal Execution OS
-- ----------------------------------------------------------------------------
-- Turns a match opportunity into a managed transaction: a Deal Twin per real
-- transaction with journey, negotiations, objections and tasks. Derives from
-- the existing match/forecast layers WITHOUT modifying them. Deterministic.
-- No LLM. No auto-contact. Org-scoped; managers org-wide, agents own assigned.
-- Idempotent.
-- ============================================================================

-- 1) deal_profiles — the Deal Twin (one per managed transaction).
create table if not exists public.deal_profiles (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  match_id              uuid references public.match_intelligence_profiles(id) on delete cascade,
  deal_id               uuid references public.deals(id) on delete set null,
  buyer_id              uuid references public.buyers(id) on delete set null,
  seller_id             uuid references public.sellers(id) on delete set null,
  property_id           uuid references public.properties(id) on delete set null,
  assigned_agent_id     uuid references public.users(id) on delete set null,
  deal_stage            text not null default 'new_opportunity',
  deal_health           smallint not null default 0,
  deal_risk             smallint not null default 0,
  deal_velocity         smallint not null default 0,
  deal_probability      smallint not null default 0,
  deal_value            bigint not null default 0,
  commission_value      bigint not null default 0,
  expected_close_date   date,
  primary_blocker       text,
  next_best_action      text,
  ai_summary            text,
  status                text not null default 'active',  -- active|won|lost|archived
  locality              text,
  metadata              jsonb not null default '{}'::jsonb,
  last_calculated_at    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint deal_profiles_uniq unique (organization_id, match_id)
);
create index if not exists deal_profiles_org_idx    on public.deal_profiles(organization_id);
create index if not exists deal_profiles_agent_idx   on public.deal_profiles(assigned_agent_id);
create index if not exists deal_profiles_stage_idx    on public.deal_profiles(deal_stage);
create index if not exists deal_profiles_prob_idx      on public.deal_profiles(deal_probability desc);

-- 2) deal_journeys — stage history per deal.
create table if not exists public.deal_journeys (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  deal_profile_id   uuid not null references public.deal_profiles(id) on delete cascade,
  stage             text not null,  -- new_opportunity|contacted|meeting_scheduled|property_visit|negotiation|offer_sent|offer_received|agreement_draft|legal_review|signed|closed|lost
  entered_at        timestamptz not null default now(),
  exited_at         timestamptz,
  duration_hours    integer,
  owner_id          uuid references public.users(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists deal_journeys_deal_idx on public.deal_journeys(deal_profile_id);

-- 3) deal_negotiations.
create table if not exists public.deal_negotiations (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  deal_profile_id        uuid not null references public.deal_profiles(id) on delete cascade,
  asking_price           bigint,
  buyer_offer            bigint,
  seller_counter_offer   bigint,
  current_gap            bigint not null default 0,
  price_movement         bigint not null default 0,
  concessions            jsonb not null default '[]'::jsonb,
  agreement_probability  smallint not null default 0,
  note                   text,
  created_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists deal_negotiations_deal_idx on public.deal_negotiations(deal_profile_id);

-- 4) deal_objections.
create table if not exists public.deal_objections (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  deal_profile_id   uuid not null references public.deal_profiles(id) on delete cascade,
  objection_type    text not null,  -- price|financing|location|timing|competition|seller_concern|legal|other
  severity          text not null default 'medium',  -- low|medium|high|critical
  resolved          boolean not null default false,
  owner_id          uuid references public.users(id) on delete set null,
  description       text,
  recommended_action text,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists deal_objections_deal_idx on public.deal_objections(deal_profile_id);

-- 5) deal_tasks.
create table if not exists public.deal_tasks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  deal_profile_id   uuid not null references public.deal_profiles(id) on delete cascade,
  title             text not null,
  owner_id          uuid references public.users(id) on delete set null,
  priority          text not null default 'medium',
  deadline          timestamptz,
  impact_score      smallint not null default 50,
  status            text not null default 'open',  -- open|done|dismissed
  reason            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists deal_tasks_deal_idx   on public.deal_tasks(deal_profile_id);
create index if not exists deal_tasks_status_idx on public.deal_tasks(status);

-- updated_at triggers
do $$
declare t text;
  tbls text[] := array['deal_profiles','deal_negotiations','deal_objections','deal_tasks'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — deal_profiles: managers org-wide, agents own (assigned_agent_id = auth.uid()).
alter table public.deal_profiles enable row level security;
drop policy if exists "deal_profiles_select" on public.deal_profiles;
create policy "deal_profiles_select" on public.deal_profiles for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or assigned_agent_id = auth.uid()));
drop policy if exists "deal_profiles_write" on public.deal_profiles;
create policy "deal_profiles_write" on public.deal_profiles for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- Child tables: org-scoped (read all members, write agent+).
do $$
declare t text;
  tbls text[] := array['deal_journeys','deal_negotiations','deal_objections','deal_tasks'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.deal_profiles, public.deal_journeys, public.deal_negotiations, public.deal_objections, public.deal_tasks to authenticated;
grant all privileges on
  public.deal_profiles, public.deal_journeys, public.deal_negotiations, public.deal_objections, public.deal_tasks to service_role;
