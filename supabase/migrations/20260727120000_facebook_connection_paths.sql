-- ============================================================================
-- ZONO — Facebook connection PATHS (Phase 17, additive).
-- ----------------------------------------------------------------------------
-- Two PARALLEL, DISTINCT connection types (not the same connection):
--   1. meta_oauth       → official Meta Graph API path (Pages, Instagram,
--                         Lead Ads, Analytics, WhatsApp Business). When real,
--                         per-provider OAuth tokens live in
--                         distribution_provider_connections.access_token_encrypted
--                         — NOT here. This row only tracks the umbrella state.
--   2. chrome_extension → user-assisted publishing path (Facebook Groups,
--                         Marketplace, browser flows). The extension runs in the
--                         USER's own browser/session.
--
-- SECURITY: this table NEVER stores a Facebook password, Facebook cookies, or a
-- session token for the chrome_extension path. `metadata` holds only
-- non-sensitive signals (extension version, last heartbeat, detected-session
-- boolean). No publishing logic here — connection state only.
-- ============================================================================

create table if not exists public.facebook_connection_paths (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  path_type       text not null,                         -- 'meta_oauth' | 'chrome_extension'
  status          text not null default 'not_connected', -- meta: not_connected|connected|expired|error
                                                          -- ext:  not_installed|installed|facebook_session_detected|ready|error
  metadata        jsonb not null default '{}'::jsonb,     -- non-sensitive only (version, heartbeat, flags)
  last_checked_at timestamptz,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, path_type),
  constraint facebook_connection_paths_type_chk check (path_type in ('meta_oauth', 'chrome_extension'))
);

create index if not exists facebook_connection_paths_org_idx
  on public.facebook_connection_paths(org_id);

drop trigger if exists trg_facebook_connection_paths_updated on public.facebook_connection_paths;
create trigger trg_facebook_connection_paths_updated
  before update on public.facebook_connection_paths
  for each row execute function public.set_updated_at();

alter table public.facebook_connection_paths enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_select') then
    create policy "facebook_connection_paths_select" on public.facebook_connection_paths
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_insert') then
    create policy "facebook_connection_paths_insert" on public.facebook_connection_paths
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_update') then
    create policy "facebook_connection_paths_update" on public.facebook_connection_paths
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_delete') then
    create policy "facebook_connection_paths_delete" on public.facebook_connection_paths
      for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

grant select, insert, update, delete on public.facebook_connection_paths to authenticated;
