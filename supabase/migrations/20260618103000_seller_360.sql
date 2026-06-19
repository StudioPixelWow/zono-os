-- ============================================================================
-- ZONO — 0022 · Seller 360 + Property Ownership Architecture
-- ----------------------------------------------------------------------------
-- Enriches sellers into strategic 360 entities and adds an explicit
-- seller↔property ownership/representation join (property_sellers).
-- Categorical fields are text (flexible, matches the intelligence layers).
-- Convention: org column is `org_id`. Org-scoped RLS.
-- ============================================================================

-- 1) Extend sellers ----------------------------------------------------------
alter table public.sellers
  -- personal
  add column if not exists secondary_phone           text,
  add column if not exists address                   text,
  add column if not exists city                       text,
  add column if not exists locality_id                uuid,
  add column if not exists birthday                   date,
  add column if not exists occupation                 text,
  add column if not exists family_status              text,
  -- seller profile
  add column if not exists seller_type                text,
  -- motivation
  add column if not exists motivation_type            text,
  add column if not exists motivation_notes           text,
  -- urgency
  add column if not exists urgency_level              text,
  add column if not exists target_sale_date           date,
  add column if not exists must_sell_by               date,
  -- financial
  add column if not exists desired_price              numeric,
  add column if not exists minimum_price              numeric,
  add column if not exists dream_price                numeric,
  add column if not exists mortgage_exists            boolean not null default false,
  add column if not exists mortgage_balance           numeric,
  add column if not exists financial_notes            text,
  -- decision
  add column if not exists decision_style             text,
  add column if not exists main_objection             text,
  add column if not exists negotiation_sensitivity    text,
  -- communication
  add column if not exists preferred_contact_method   text,
  add column if not exists preferred_contact_time     text,
  add column if not exists communication_notes        text,
  -- psychology (0..100)
  add column if not exists price_sensitivity_score     integer not null default 50,
  add column if not exists time_sensitivity_score      integer not null default 50,
  add column if not exists trust_sensitivity_score     integer not null default 50,
  add column if not exists marketing_openness_score    integer not null default 50,
  add column if not exists negotiation_flexibility_score integer not null default 50,
  add column if not exists cooperation_score           integer not null default 50,
  -- operational
  add column if not exists available_for_showings     boolean not null default true,
  add column if not exists allows_marketing           boolean not null default true,
  add column if not exists allows_signage             boolean not null default false,
  add column if not exists allows_exclusive           boolean not null default false,
  add column if not exists has_signed_agreement       boolean not null default false,
  -- AI-ready
  add column if not exists seller_profile_summary     text,
  add column if not exists ai_psychology_summary      text,
  add column if not exists ai_negotiation_summary     text,
  add column if not exists ai_risk_summary            text;

-- 2) property_sellers --------------------------------------------------------
create table public.property_sellers (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  property_id               uuid not null references public.properties(id) on delete cascade,
  seller_id                 uuid not null references public.sellers(id) on delete cascade,
  relationship_type         text not null default 'owner',
  ownership_percentage      numeric,
  is_primary                boolean not null default false,
  is_decision_maker         boolean not null default false,
  can_sign                  boolean not null default false,
  receives_reports          boolean not null default true,
  participates_in_negotiation boolean not null default true,
  status                    text not null default 'active',
  notes                     text,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint property_sellers_uniq unique (org_id, property_id, seller_id, relationship_type)
);

create index property_sellers_org_idx       on public.property_sellers(org_id);
create index property_sellers_property_idx    on public.property_sellers(property_id);
create index property_sellers_seller_idx       on public.property_sellers(seller_id);
create index property_sellers_primary_idx      on public.property_sellers(is_primary);
create index property_sellers_dm_idx           on public.property_sellers(is_decision_maker);
create index property_sellers_status_idx       on public.property_sellers(status);

create trigger trg_property_sellers_updated before update on public.property_sellers
  for each row execute function public.set_updated_at();

alter table public.property_sellers enable row level security;
create policy "property_sellers_select" on public.property_sellers
  for select to authenticated using (org_id = public.current_org_id());
create policy "property_sellers_insert" on public.property_sellers
  for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
create policy "property_sellers_update" on public.property_sellers
  for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());
create policy "property_sellers_delete" on public.property_sellers
  for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on public.property_sellers to authenticated;
grant all privileges on public.property_sellers to service_role;
