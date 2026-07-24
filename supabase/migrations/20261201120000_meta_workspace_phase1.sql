-- ============================================================================
-- ZONO — Batch 6.8 · Meta Workspace — Phase 1 schema (Connections, Assets,
-- Permissions, Token Health). ADDITIVE + IDEMPOTENT. No frozen table is altered.
-- Every table is org-scoped with RLS via public.current_org_id(). Token columns
-- (token_ref) are ENCRYPTED at rest and are never selected into client-facing
-- projections (the app read models drop them); token-health is service-role only.
-- Supports multiple Meta businesses / Pages / Instagram accounts per organization.
-- ============================================================================

-- ── Connection (org-scoped Meta connection + encrypted credential) ──────────
create table if not exists public.meta_connection (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  authorizing_user_id uuid references public.users(id) on delete set null,  -- audit provenance only
  provider_key text not null default 'graph',
  mode text not null default 'unknown'
    check (mode in ('user_oauth','business_login','system_user','unknown')),
  business_external_id text,                       -- opaque Meta business id
  token_ref text,                                  -- ENCRYPTED credential ref (never plaintext)
  token_kind text not null default 'unknown'
    check (token_kind in ('user','page','system_user','unknown')),
  expires_at timestamptz,
  status text not null default 'not_connected'
    check (status in ('not_connected','connected','needs_reauth','revoked','disabled')),
  health text not null default 'unknown'
    check (health in ('healthy','degraded','unhealthy','unknown')),
  granted_capabilities text[] not null default '{}',   -- CANONICAL capability keys actually granted
  reconnect_required boolean not null default false,
  last_verified_at timestamptz,
  disconnected_at timestamptz,
  revocation_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One LIVE connection per (org, business); revoked/tombstoned history is allowed.
create unique index if not exists meta_connection_live_business_uq
  on public.meta_connection (org_id, business_external_id)
  where business_external_id is not null and status <> 'revoked';
create index if not exists meta_connection_status_idx on public.meta_connection (org_id, status);

-- ── Business Portfolio ──────────────────────────────────────────────────────
create table if not exists public.meta_business (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.meta_connection(id) on delete cascade,
  external_id text not null,
  name text not null default '',
  verification_status text not null default 'unknown',
  status text not null default 'active'
    check (status in ('active','disconnected','restricted','tombstoned','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_business_org_external_uq unique (org_id, external_id)
);
create index if not exists meta_business_conn_idx on public.meta_business (org_id, connection_id);

-- ── Facebook Page asset (encrypted Page credential) ─────────────────────────
create table if not exists public.meta_page (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.meta_connection(id) on delete cascade,
  external_id text not null,
  name text not null default '',
  category text,
  token_ref text,                                  -- ENCRYPTED page credential ref
  permitted_tasks text[] not null default '{}',    -- canonical task keys
  linked_instagram_external_id text,
  status text not null default 'active'
    check (status in ('active','disconnected','restricted','tombstoned','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_page_org_external_uq unique (org_id, external_id)
);
create index if not exists meta_page_conn_idx on public.meta_page (org_id, connection_id);
create index if not exists meta_page_status_idx on public.meta_page (org_id, status);

-- ── Instagram Professional account (linked to a Page) ───────────────────────
create table if not exists public.meta_instagram_account (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.meta_connection(id) on delete cascade,
  external_id text not null,
  username text not null default '',
  account_type text not null default 'unknown'
    check (account_type in ('business','creator','unknown')),
  page_external_id text not null default '',
  followers integer,
  status text not null default 'active'
    check (status in ('active','disconnected','restricted','tombstoned','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_instagram_org_external_uq unique (org_id, external_id)
);
create index if not exists meta_instagram_conn_idx on public.meta_instagram_account (org_id, connection_id);

-- ── Permission snapshot (granted vs configured at a point in time) ──────────
create table if not exists public.meta_permission_snapshot (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.meta_connection(id) on delete cascade,
  granted text[] not null default '{}',            -- CANONICAL capability keys granted
  configured text[] not null default '{}',         -- CANONICAL capability keys requested
  mode text not null default 'unknown',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists meta_permission_snapshot_conn_idx on public.meta_permission_snapshot (org_id, connection_id);

-- ── Token health history (service-role only) ────────────────────────────────
create table if not exists public.meta_token_health (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.meta_connection(id) on delete cascade,
  ok boolean not null,
  checked_at timestamptz not null default now(),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists meta_token_health_conn_idx on public.meta_token_health (org_id, connection_id);

-- ── Incremental sync cursor (service-role only) ─────────────────────────────
create table if not exists public.meta_sync_cursor (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.meta_connection(id) on delete cascade,
  asset_ref text not null,
  kind text not null,
  cursor text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint meta_sync_cursor_uq unique (org_id, asset_ref, kind)
);

-- ── RLS — org SELECT for asset/permission tables; secrets stay service-role ──
do $$
declare t text;
begin
  -- Org-readable tables (writes remain service-role; token columns are dropped
  -- by the app read models, never projected to clients).
  foreach t in array array[
    'meta_connection','meta_business','meta_page',
    'meta_instagram_account','meta_permission_snapshot'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
  end loop;

  -- Service-role-only tables: enable RLS with NO authenticated policy, so only the
  -- service role (which bypasses RLS) can read/write them.
  foreach t in array array['meta_token_health','meta_sync_cursor'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
  end loop;
end $$;
