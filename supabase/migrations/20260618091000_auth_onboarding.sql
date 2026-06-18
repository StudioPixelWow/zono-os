-- ============================================================================
-- ZONO — 0010 · Auth & onboarding foundation
-- ----------------------------------------------------------------------------
-- Extends users and organizations with the profile / preference / onboarding
-- fields the signup wizard collects, and adds a helper that seeds the default
-- system roles for a freshly created organization.
-- ============================================================================

-- ── users: profile & preferences ─────────────────────────────────────────────
-- (full_name, email, phone, avatar_url, title=job title, role_id already exist)
alter table public.users
  add column if not exists operating_city          text,
  add column if not exists operating_neighborhoods text[]          not null default '{}',
  add column if not exists property_types          property_type[] not null default '{}',
  add column if not exists deal_types              listing_kind[]  not null default '{}',
  add column if not exists min_price               integer check (min_price is null or min_price >= 0),
  add column if not exists max_price               integer check (max_price is null or max_price >= 0),
  add column if not exists min_rooms               numeric(3,1),
  add column if not exists max_rooms               numeric(3,1),
  add column if not exists notification_preferences jsonb          not null default '{}'::jsonb,
  add column if not exists onboarding_completed    boolean         not null default false;

-- ── organizations: contact, operating area & defaults ────────────────────────
-- (name, logo_url, plan=subscription, regions already exist)
alter table public.organizations
  add column if not exists phone                    text,
  add column if not exists email                    citext,
  add column if not exists city                     text,
  add column if not exists operating_cities         text[]          not null default '{}',
  add column if not exists operating_neighborhoods  text[]          not null default '{}',
  add column if not exists default_property_types   property_type[] not null default '{}',
  add column if not exists default_deal_types       listing_kind[]  not null default '{}',
  add column if not exists onboarding_completed     boolean         not null default false;

-- ── default system roles for a new organization ──────────────────────────────
-- Called from the onboarding flow right after an organization is created.
-- Idempotent via the unique(org_id, key) constraint on roles.
create or replace function public.seed_org_default_roles(p_org uuid)
returns void
language sql
as $$
  insert into public.roles (org_id, key, name, description, is_system)
  values
    (p_org, 'owner',   'בעלים',    'גישה מלאה לארגון',                 true),
    (p_org, 'admin',   'מנהל מערכת','ניהול משתמשים והגדרות',           true),
    (p_org, 'manager', 'מנהל',      'ניהול צוות ונכסים',               true),
    (p_org, 'agent',   'סוכן',      'עבודה שוטפת מול לקוחות ונכסים',    true),
    (p_org, 'viewer',  'צופה',      'צפייה בלבד',                      true)
  on conflict (org_id, key) do nothing;
$$;

comment on function public.seed_org_default_roles(uuid) is
  'Seeds the five default system roles (owner/admin/manager/agent/viewer) for an organization.';

grant execute on function public.seed_org_default_roles(uuid) to authenticated, service_role;
