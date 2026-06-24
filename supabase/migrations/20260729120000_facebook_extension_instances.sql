-- ============================================================================
-- ZONO — Chrome Extension handshake (Phase 20, additive).
-- ----------------------------------------------------------------------------
-- The Chrome extension publishes to Facebook GROUPS / MARKETPLACE from the
-- USER's own browser session, with human approval. ZONO NEVER receives Facebook
-- passwords, cookies, or browser session tokens. These tables hold only:
--   • pairing codes (hashed, short-lived, one-time) to bind an extension install
--     to an org/user
--   • extension instances (hashed secret only — never the raw secret)
-- No Facebook credentials are stored anywhere here. No publishing logic here.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── Pairing codes — short-lived, one-time, bind install → org/user ────────────
create table if not exists public.facebook_extension_pairings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  code_hash   text not null,                       -- sha256 of the pairing code (never the raw code)
  expires_at  timestamptz not null,                -- 10 minutes from creation
  used_at     timestamptz,                         -- set once on complete (one-time use)
  created_at  timestamptz not null default now()
);
create index if not exists facebook_extension_pairings_lookup_idx
  on public.facebook_extension_pairings(code_hash);
create index if not exists facebook_extension_pairings_org_idx
  on public.facebook_extension_pairings(org_id);

-- ── Extension instances — hashed secret only ─────────────────────────────────
create table if not exists public.facebook_extension_instances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  instance_id   text not null,                     -- public id the extension presents
  secret_hash   text not null,                     -- sha256 of the extension secret (NEVER the raw secret)
  status        text not null default 'installed', -- installed | facebook_session_detected | ready | revoked | error
  version       text,
  last_seen_at  timestamptz,
  metadata      jsonb not null default '{}'::jsonb, -- non-sensitive only (fb display name/id, session flag)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (instance_id)
);
create index if not exists facebook_extension_instances_org_idx
  on public.facebook_extension_instances(org_id);

drop trigger if exists trg_facebook_extension_instances_updated on public.facebook_extension_instances;
create trigger trg_facebook_extension_instances_updated
  before update on public.facebook_extension_instances
  for each row execute function public.set_updated_at();

-- ── RLS — same-org read; writes happen server-side via service-role only ──────
alter table public.facebook_extension_pairings  enable row level security;
alter table public.facebook_extension_instances enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_extension_pairings' and policyname='facebook_extension_pairings_select') then
    create policy "facebook_extension_pairings_select" on public.facebook_extension_pairings
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_extension_instances' and policyname='facebook_extension_instances_select') then
    create policy "facebook_extension_instances_select" on public.facebook_extension_instances
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  -- Allow managers to revoke their org's instances from the ZONO UI.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_extension_instances' and policyname='facebook_extension_instances_update') then
    create policy "facebook_extension_instances_update" on public.facebook_extension_instances
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'))
      with check (org_id = public.current_org_id());
  end if;
end $$;

grant select on public.facebook_extension_pairings to authenticated;
grant select, update on public.facebook_extension_instances to authenticated;
grant all privileges on public.facebook_extension_pairings  to service_role;
grant all privileges on public.facebook_extension_instances to service_role;
