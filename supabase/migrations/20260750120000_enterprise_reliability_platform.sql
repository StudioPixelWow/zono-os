-- ============================================================================
-- ZONO — Phase 20: Enterprise Reliability Platform™
--
-- Infrastructure-only migration. NO business logic, NO feature tables, NO
-- changes to deterministic engines. Two additive operational tables:
--
--   A. feature_flags     — gradual rollout / kill-switches (env/org/role/user).
--   B. platform_audit_log — central, immutable who/what/when/old/new/source.
--
-- Org-scoped, admin-only. Conventions: current_org_id(), has_min_role(),
-- set_updated_at(). Idempotent (safe to replay).
-- ============================================================================

-- A. feature_flags — one row per (org, key). Null org_id = global default. -----
create table if not exists public.feature_flags (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,  -- null = global default
  flag_key      text not null,
  enabled       boolean not null default false,
  description   text,
  rollout_pct   integer not null default 0 check (rollout_pct between 0 and 100),
  min_role      text,                                   -- gate by role rank (owner/admin/manager/...)
  allow_users   uuid[] not null default '{}',           -- explicit allow-list (user ids)
  deny_users    uuid[] not null default '{}',           -- explicit deny-list (wins over everything)
  environments  text[] not null default '{}',           -- e.g. {production,preview}; empty = all
  metadata      jsonb not null default '{}'::jsonb,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- One flag per key per org (and one global row where org_id is null).
create unique index if not exists ff_org_key_uidx
  on public.feature_flags (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), flag_key);
create index if not exists ff_org_idx on public.feature_flags(org_id);
create index if not exists ff_key_idx on public.feature_flags(flag_key);

drop trigger if exists trg_feature_flags_updated on public.feature_flags;
create trigger trg_feature_flags_updated before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- B. platform_audit_log — immutable central audit trail ----------------------
create table if not exists public.platform_audit_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references public.users(id) on delete set null,  -- null = system/cron
  actor_label     text,                                   -- denormalized name/email/"system"
  action          text not null,                          -- e.g. flag.update, sync.start, role.change
  resource_type   text not null,                          -- e.g. feature_flag, property, journey
  resource_id     text,                                   -- free-form id of the affected row
  source          text not null default 'app',            -- app/cron/api/system/migration
  old_values      jsonb,
  new_values      jsonb,
  correlation_id  text,                                   -- ties multi-step operations together
  request_id      text,
  trace_id        text,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index if not exists pal_org_idx     on public.platform_audit_log(org_id, created_at desc);
create index if not exists pal_actor_idx   on public.platform_audit_log(org_id, actor_id);
create index if not exists pal_action_idx  on public.platform_audit_log(org_id, action);
create index if not exists pal_resource_idx on public.platform_audit_log(org_id, resource_type, resource_id);
create index if not exists pal_corr_idx    on public.platform_audit_log(correlation_id);

-- RLS ------------------------------------------------------------------------
-- feature_flags: admin+ may read/write within their org; global rows readable
-- by any authenticated org member (so flags resolve), writable only by admins
-- of any org via service role. Members never write flags.
alter table public.feature_flags enable row level security;
drop policy if exists "feature_flags_select" on public.feature_flags;
create policy "feature_flags_select" on public.feature_flags
  for select to authenticated
  using (org_id is null or org_id = public.current_org_id());
drop policy if exists "feature_flags_write" on public.feature_flags;
create policy "feature_flags_write" on public.feature_flags
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('admin'))
  with check (org_id = public.current_org_id() and public.has_min_role('admin'));
grant select, insert, update, delete on public.feature_flags to authenticated;
grant all privileges on public.feature_flags to service_role;

-- platform_audit_log: admin+ may READ their org's trail; it is append-only and
-- never updated/deleted from the app. Inserts happen via service role (server
-- actions / cron) to preserve integrity even for member-initiated actions.
alter table public.platform_audit_log enable row level security;
drop policy if exists "platform_audit_log_select" on public.platform_audit_log;
create policy "platform_audit_log_select" on public.platform_audit_log
  for select to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('admin'));
grant select on public.platform_audit_log to authenticated;
grant all privileges on public.platform_audit_log to service_role;
