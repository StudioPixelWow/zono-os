-- ============================================================================
-- ZONO — 0003 · Core tenant tables: organizations, roles, users
-- ----------------------------------------------------------------------------
-- organizations is the tenant. Every other table carries org_id and RLS
-- isolates tenants by it. users link 1:1 to Supabase auth.users and reference
-- a role within their organization.
-- ============================================================================

-- ── organizations ────────────────────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        citext unique,
  plan        org_plan not null default 'starter',
  regions     region[] not null default '{}',
  logo_url    text,
  locale      text not null default 'he',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ── roles ─────────────────────────────────────────────────────────────────────
-- Per-organization roles. `key` drives RLS role-rank checks
-- (owner > admin > manager > agent > viewer). `permissions` allows fine-grained
-- feature flags layered on top of the coarse rank.
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  key          text not null,
  name         text not null,
  description  text,
  permissions  jsonb not null default '{}'::jsonb,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint roles_org_key_unique unique (org_id, key)
);

create index idx_roles_org on public.roles (org_id);

create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

-- ── users ─────────────────────────────────────────────────────────────────────
-- Application users (agents & staff). id equals auth.users.id (Supabase Auth).
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  role_id       uuid references public.roles(id) on delete set null,
  full_name     text not null,
  email         citext not null,
  phone         text,
  avatar_url    text,
  title         text,
  status        user_status not null default 'invited',
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_email_unique unique (email)
);

create index idx_users_org on public.users (org_id);
create index idx_users_role on public.users (role_id);
create index idx_users_org_status on public.users (org_id, status);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
