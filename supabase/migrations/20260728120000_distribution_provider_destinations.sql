-- ============================================================================
-- ZONO — Distribution provider DESTINATIONS (Phase 19, additive).
-- ----------------------------------------------------------------------------
-- A destination is a concrete publishing target discovered under a connected
-- provider — e.g. a Facebook Page the user manages (GET /me/accounts). This is
-- DISCOVERY ONLY: rows record what targets exist. NOTHING here publishes.
--
-- Page access tokens, when Meta returns them, are stored ENCRYPTED in
-- access_token_encrypted (same AES-256-GCM scheme as provider connections) and
-- are NEVER returned to the client.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

create table if not exists public.distribution_provider_destinations (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  provider                text not null,                          -- 'facebook' (others later)
  destination_type        text not null,                          -- 'facebook_page' (others later)
  external_id             text not null,                          -- Meta Page id
  name                    text,
  category                text,
  status                  text not null default 'available',      -- available | unavailable | error
  access_token_encrypted  text,                                   -- encrypted Page token (nullable)
  metadata                jsonb not null default '{}'::jsonb,      -- non-sensitive (tasks/perms, etc.)
  last_synced_at          timestamptz,
  created_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, provider, destination_type, external_id)
);

create index if not exists distribution_provider_destinations_org_idx
  on public.distribution_provider_destinations(org_id);
create index if not exists distribution_provider_destinations_lookup_idx
  on public.distribution_provider_destinations(org_id, provider, destination_type);

drop trigger if exists trg_distribution_provider_destinations_updated on public.distribution_provider_destinations;
create trigger trg_distribution_provider_destinations_updated
  before update on public.distribution_provider_destinations
  for each row execute function public.set_updated_at();

-- ── RLS — same-org read; manager/agent write ─────────────────────────────────
alter table public.distribution_provider_destinations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_select') then
    create policy "distribution_provider_destinations_select" on public.distribution_provider_destinations
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_insert') then
    create policy "distribution_provider_destinations_insert" on public.distribution_provider_destinations
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_update') then
    create policy "distribution_provider_destinations_update" on public.distribution_provider_destinations
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'))
      with check (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_delete') then
    create policy "distribution_provider_destinations_delete" on public.distribution_provider_destinations
      for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

grant select, insert, update, delete on public.distribution_provider_destinations to authenticated;
grant all privileges on public.distribution_provider_destinations to service_role;
