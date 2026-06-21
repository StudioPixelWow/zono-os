-- ============================================================================
-- ZONO — 0044 · Agent Operating Areas Management
-- ----------------------------------------------------------------------------
-- Extends the EXISTING user_operating_localities so an agent/manager can manage
-- multiple working cities AFTER onboarding (add a city, set primary, toggle how
-- each city feeds intelligence, enable/disable). No duplicate area model, no
-- onboarding change, no data loss. All columns additive & nullable/defaulted.
-- Idempotent.
-- ============================================================================

alter table public.user_operating_localities
  add column if not exists organization_id          uuid references public.organizations(id) on delete cascade,
  add column if not exists city_name                text,
  add column if not exists neighborhoods            jsonb   not null default '[]'::jsonb,
  add column if not exists is_active                boolean not null default true,
  add column if not exists use_for_leads            boolean not null default true,
  add column if not exists use_for_properties       boolean not null default true,
  add column if not exists use_for_transactions     boolean not null default true,
  add column if not exists use_for_external_listings boolean not null default true,
  add column if not exists use_for_recommendations  boolean not null default true,
  add column if not exists added_by                 uuid references public.users(id) on delete set null,
  add column if not exists added_at                 timestamptz not null default now(),
  add column if not exists last_sync_at             timestamptz,
  add column if not exists metadata                 jsonb   not null default '{}'::jsonb;

-- Backfill derived columns for rows created during onboarding (pre-this-migration).
update public.user_operating_localities u
  set organization_id = usr.org_id
  from public.users usr
  where usr.id = u.user_id and u.organization_id is null;

update public.user_operating_localities u
  set city_name = il.name_he
  from public.israel_localities il
  where il.id = u.locality_id and (u.city_name is null or u.city_name = '');

update public.user_operating_localities
  set added_at = created_at
  where added_at is null;

create index if not exists idx_user_op_localities_active
  on public.user_operating_localities (user_id, is_active);
create index if not exists idx_user_op_localities_org_active
  on public.user_operating_localities (organization_id, is_active);
