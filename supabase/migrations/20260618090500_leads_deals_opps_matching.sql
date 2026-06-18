-- ============================================================================
-- ZONO — 0006 · Pipeline: leads, deals, opportunities, matching_results
-- ----------------------------------------------------------------------------
-- leads convert into buyers/sellers; deals are the CRM pipeline; opportunities
-- are AI-surfaced recommendations; matching_results are scored buyer↔listing
-- pairings produced by the matching engine (or created manually).
-- ============================================================================

-- ── leads ─────────────────────────────────────────────────────────────────────
create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  owner_id             uuid references public.users(id) on delete set null,
  full_name            text not null,
  phone                text,
  email                citext,
  source               lead_source,
  intent               lead_intent not null default 'unknown',
  stage                lead_stage not null default 'new',
  message              text,
  score                smallint check (score between 0 and 100),
  property_id          uuid references public.properties(id) on delete set null,
  project_id           uuid references public.projects(id) on delete set null,
  converted_buyer_id   uuid references public.buyers(id) on delete set null,
  converted_seller_id  uuid references public.sellers(id) on delete set null,
  lost_reason          text,
  last_activity_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_leads_org on public.leads (org_id);
create index idx_leads_owner on public.leads (owner_id);
create index idx_leads_org_stage on public.leads (org_id, stage);
create index idx_leads_source on public.leads (source);
create index idx_leads_last_activity on public.leads (last_activity_at);

create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── deals ─────────────────────────────────────────────────────────────────────
create table public.deals (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  owner_id             uuid references public.users(id) on delete set null,
  title                text not null,
  type                 deal_type not null default 'sale',
  stage                deal_stage not null default 'new',
  status               deal_status not null default 'open',
  value                integer check (value is null or value >= 0),
  commission_amount    integer check (commission_amount is null or commission_amount >= 0),
  commission_pct       numeric(5,2),
  probability          smallint check (probability between 0 and 100),
  buyer_id             uuid references public.buyers(id) on delete set null,
  seller_id            uuid references public.sellers(id) on delete set null,
  property_id          uuid references public.properties(id) on delete set null,
  unit_id              uuid references public.units(id) on delete set null,
  project_id           uuid references public.projects(id) on delete set null,
  lead_id              uuid references public.leads(id) on delete set null,
  expected_close_date  date,
  closed_at            timestamptz,
  lost_reason          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_deals_org on public.deals (org_id);
create index idx_deals_owner on public.deals (owner_id);
create index idx_deals_org_stage on public.deals (org_id, stage);
create index idx_deals_org_status on public.deals (org_id, status);
create index idx_deals_buyer on public.deals (buyer_id);
create index idx_deals_property on public.deals (property_id);
create index idx_deals_expected_close on public.deals (expected_close_date);

create trigger trg_deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- ── opportunities ─────────────────────────────────────────────────────────────
create table public.opportunities (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  owner_id          uuid references public.users(id) on delete cascade,
  type              opportunity_type not null,
  priority          opportunity_priority not null default 'medium',
  status            opportunity_status not null default 'open',
  title             text not null,
  summary           text,
  suggested_action  text,
  potential_value   integer check (potential_value is null or potential_value >= 0),
  confidence        smallint check (confidence between 0 and 100),
  property_id       uuid references public.properties(id) on delete set null,
  unit_id           uuid references public.units(id) on delete set null,
  buyer_id          uuid references public.buyers(id) on delete set null,
  seller_id         uuid references public.sellers(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  deal_id           uuid references public.deals(id) on delete set null,
  snoozed_until     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_opportunities_org on public.opportunities (org_id);
create index idx_opportunities_owner_status on public.opportunities (owner_id, status, priority);
create index idx_opportunities_snoozed on public.opportunities (snoozed_until);

create trigger trg_opportunities_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ── matching_results ──────────────────────────────────────────────────────────
-- Scored buyer↔(property|unit) pairing. Exactly one target must be set.
create table public.matching_results (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  buyer_id               uuid not null references public.buyers(id) on delete cascade,
  property_id            uuid references public.properties(id) on delete cascade,
  unit_id                uuid references public.units(id) on delete cascade,
  score                  smallint not null check (score between 0 and 100),
  reasons                jsonb not null default '[]'::jsonb,
  meets_hard_constraints boolean not null default false,
  status                 matching_status not null default 'new',
  source                 matching_source not null default 'engine',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint matching_one_target check (
    (property_id is not null)::int + (unit_id is not null)::int = 1
  )
);

create unique index uq_matching_buyer_property on public.matching_results (buyer_id, property_id)
  where property_id is not null;
create unique index uq_matching_buyer_unit on public.matching_results (buyer_id, unit_id)
  where unit_id is not null;
create index idx_matching_org_score on public.matching_results (org_id, score desc);
create index idx_matching_buyer_status on public.matching_results (buyer_id, status);
create index idx_matching_property on public.matching_results (property_id);

create trigger trg_matching_results_updated_at
  before update on public.matching_results
  for each row execute function public.set_updated_at();
