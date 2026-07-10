-- ============================================================================
-- ZONO — Facebook connection is PER USER / PER BROKER (not org-global).
-- ----------------------------------------------------------------------------
-- The Facebook OAuth identity + token belong to the individual broker who
-- connected, NOT the whole office. Previously distribution_provider_connections
-- had unique(org_id, provider), so one broker's Facebook connection was global
-- ("Maya connected for everyone"). We add a per-connection `user_id` and make
-- Facebook rows unique per (org_id, provider, user_id) while keeping the other
-- providers (whatsapp/instagram/pages/groups/marketplace) org-scoped.
-- No token is exposed; tokens stay encrypted at rest.
-- ============================================================================

-- 1) Per-connection owner. NULL = org-scoped provider; NOT NULL = user-scoped.
alter table public.distribution_provider_connections
  add column if not exists user_id uuid references public.users(id) on delete cascade;

-- 2) Backfill: attribute existing Facebook connections to the broker who created
--    them, so the currently-connected broker stays connected to THEIR OWN
--    account (other brokers must connect their own).
update public.distribution_provider_connections
  set user_id = created_by
  where provider = 'facebook' and user_id is null and created_by is not null;

-- 3) Replace the org-global uniqueness with a scope-aware scheme.
alter table public.distribution_provider_connections
  drop constraint if exists distribution_provider_connections_org_id_provider_key;

-- Org-scoped providers (user_id IS NULL): one row per (org, provider).
create unique index if not exists uq_dpc_org_provider_orgscope
  on public.distribution_provider_connections (org_id, provider)
  where user_id is null;

-- User-scoped providers (Facebook OAuth identity): one row per (org, provider, user).
create unique index if not exists uq_dpc_org_provider_user
  on public.distribution_provider_connections (org_id, provider, user_id)
  where user_id is not null;

-- Fast lookups by owner.
create index if not exists idx_dpc_user
  on public.distribution_provider_connections (user_id);
