-- ============================================================================
-- ZONO — Facebook Groups: import the CONNECTED USER's groups via the extension.
-- ----------------------------------------------------------------------------
-- Additive + idempotent. Lets the browser extension (already paired org+user)
-- report the groups the signed-in user is a member of, so they are imported into
-- the canonical distribution_groups registry — instead of being typed by hand.
--   • distribution_groups gains provenance + membership + sync columns.
--   • A UNIQUE (org_id, external_group_id) index makes re-scans idempotent (upsert).
--   • facebook_extension_instances gains a pull-model scan request + scan stats.
--   • distribution_group_sync_events is an append-only audit trail of every import
--     / update / disconnect (reuses the P0 append-only trigger fn).
-- No new publishing model: imported groups are ordinary distribution_groups rows
-- and flow through the SAME canonical path (campaigns → posts → jobs → events).
-- Backward-compatible: all columns nullable/defaulted; existing rows untouched.
-- ============================================================================

-- ── 1) Provenance + membership + sync columns on distribution_groups ─────────
alter table public.distribution_groups
  add column if not exists source          text,          -- manual | scan | import (null = legacy manual)
  add column if not exists imported_by      uuid references public.users(id) on delete set null,
  add column if not exists imported_at      timestamptz,
  add column if not exists last_synced_at   timestamptz,
  add column if not exists is_member        boolean,       -- is the connected user a member?
  add column if not exists member_role      text;          -- member | admin | moderator

-- Idempotent re-scan: at most one row per (org, external_group_id). Partial so the
-- many legacy/manual rows without an external id are exempt.
create unique index if not exists uq_dgroups_org_external
  on public.distribution_groups (org_id, external_group_id)
  where external_group_id is not null;

create index if not exists idx_dgroups_source
  on public.distribution_groups (org_id, source);

-- ── 2) Extension instance: pull-model scan request + scan stats ──────────────
alter table public.facebook_extension_instances
  add column if not exists scan_requested_at timestamptz,   -- ZONO UI asks; extension reads + scans
  add column if not exists last_scan_at       timestamptz,
  add column if not exists groups_imported    integer not null default 0,
  add column if not exists capabilities       jsonb not null default '{}'::jsonb; -- e.g. {"group_read": true}

-- ── 3) Append-only audit trail of imports / syncs / connection changes ───────
create table if not exists public.distribution_group_sync_events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid references public.users(id) on delete set null,
  instance_id       text,                         -- the extension instance public id (if any)
  action            text not null,                -- scan_requested | scan_started | group_imported | group_updated | group_reactivated | group_archived | sync | disconnect | reconnect
  external_group_id text,
  group_id          uuid references public.distribution_groups(id) on delete set null,
  details           jsonb not null default '{}'::jsonb,
  occurred_at       timestamptz not null default now()
);
create index if not exists idx_dgse_org_time on public.distribution_group_sync_events (org_id, occurred_at desc);
create index if not exists idx_dgse_group    on public.distribution_group_sync_events (group_id, occurred_at desc);

alter table public.distribution_group_sync_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_group_sync_events' and policyname='dgse_select') then
    create policy dgse_select on public.distribution_group_sync_events
      for select using (org_id = public.current_org_id());
  end if;
end $$;

-- Append-only (reuse the P0 mutation-forbidding trigger function).
drop trigger if exists trg_dgse_append_only on public.distribution_group_sync_events;
create trigger trg_dgse_append_only
  before update or delete on public.distribution_group_sync_events
  for each row execute function public.zono_forbid_mutation();

grant select on public.distribution_group_sync_events to authenticated;
grant all privileges on public.distribution_group_sync_events to service_role;
