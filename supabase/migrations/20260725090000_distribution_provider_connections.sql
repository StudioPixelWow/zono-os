-- ============================================================================
-- ZONO — Distribution provider CONNECTIONS (Phase 10.3, additive).
-- ----------------------------------------------------------------------------
-- Connection MANAGEMENT only. There is NO live Meta API integration yet: rows
-- here track each provider's connection state per org (default not_connected /
-- manual_mode). Tokens are nullable and only ever set once an official, approved
-- API connection exists — until then they stay NULL and publishing is MANUAL via
-- the Publish Assistant. No publishing, no scraping, no faked "connected".
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

create table if not exists public.distribution_provider_connections (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  provider                text not null,                          -- facebook | instagram | whatsapp | facebook_pages | facebook_groups | facebook_marketplace
  status                  text not null default 'not_connected',  -- not_connected|manual_mode|pending_approval|connected|expired|error|disconnected
  connection_mode         text not null default 'manual',         -- manual | api
  display_name            text,
  external_account_id     text,
  access_token_encrypted  text,                                   -- NULL until an approved API connection exists
  refresh_token_encrypted text,                                   -- NULL until an approved API connection exists
  token_expires_at        timestamptz,
  scopes                  text[] not null default '{}',
  metadata                jsonb  not null default '{}'::jsonb,
  last_validated_at       timestamptz,
  created_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, provider)
);

create index if not exists distribution_provider_connections_org_idx
  on public.distribution_provider_connections(org_id);
create index if not exists distribution_provider_connections_status_idx
  on public.distribution_provider_connections(org_id, status);

-- updated_at trigger
drop trigger if exists trg_distribution_provider_connections_updated on public.distribution_provider_connections;
create trigger trg_distribution_provider_connections_updated
  before update on public.distribution_provider_connections
  for each row execute function public.set_updated_at();

-- ── RLS — org isolation; reads = same org, writes = same org + agent role ─────
alter table public.distribution_provider_connections enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_select') then
    create policy "distribution_provider_connections_select" on public.distribution_provider_connections
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_insert') then
    create policy "distribution_provider_connections_insert" on public.distribution_provider_connections
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_update') then
    create policy "distribution_provider_connections_update" on public.distribution_provider_connections
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'))
      with check (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_delete') then
    create policy "distribution_provider_connections_delete" on public.distribution_provider_connections
      for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

grant select, insert, update, delete on public.distribution_provider_connections to authenticated;
grant all privileges on public.distribution_provider_connections to service_role;
