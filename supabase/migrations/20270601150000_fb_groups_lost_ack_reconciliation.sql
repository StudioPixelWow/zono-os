-- ============================================================================
-- ZONO -- Facebook GROUPS publishing: lost-ack / reconciliation hardening.
-- Additive + idempotent. Extends distribution_posts with the reconciliation
-- state machine, adds an append-only publish-event log, and an emergency-stop
-- control. No data is modified; existing rows keep working (defaults applied).
-- ============================================================================

-- 1. distribution_posts: reconciliation columns
alter table public.distribution_posts
  add column if not exists publish_state          text,
  add column if not exists attempt_count          integer not null default 0,
  add column if not exists idempotency_key        text,
  add column if not exists provider_post_id        text,
  add column if not exists submitted_at           timestamptz,
  add column if not exists reconciled_at          timestamptz,
  add column if not exists terminal               boolean not null default false,
  add column if not exists last_callback_id        text,
  add column if not exists last_callback_outcome   text;

-- One live submission per (org, idempotency_key). Partial: legacy/nulls exempt.
create unique index if not exists uq_dgp_org_idem
  on public.distribution_posts (org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists distribution_posts_publish_state_idx
  on public.distribution_posts (org_id, publish_state);

-- 2. distribution_publish_events -- append-only transition history
create table if not exists public.distribution_publish_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  target_id     uuid not null references public.distribution_posts(id) on delete cascade,
  from_state    text,
  to_state      text not null,
  kind          text not null,
  actor_id      uuid references public.users(id) on delete set null,
  callback_id   text,
  reason        text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists dpe_org_target_idx on public.distribution_publish_events (org_id, target_id, occurred_at);
-- Idempotent audit: the same logical callback delivery cannot log twice.
create unique index if not exists uq_dpe_target_callback_kind
  on public.distribution_publish_events (target_id, callback_id, kind)
  where callback_id is not null;

alter table public.distribution_publish_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_publish_events' and policyname='dpe_select') then
    create policy dpe_select on public.distribution_publish_events
      for select using (org_id = public.current_org_id());
  end if;
  -- Append-only: insert allowed to agents in-org; NO update/delete policy exists.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_publish_events' and policyname='dpe_insert') then
    create policy dpe_insert on public.distribution_publish_events
      for insert with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
end $$;

-- 3. distribution_publish_controls -- emergency stop
create table if not exists public.distribution_publish_controls (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  scope        text not null default 'organization',  -- organization | group
  scope_id     uuid,                                   -- null for org-wide
  state        text not null default 'active',         -- active | released
  reason       text,
  created_by   uuid references public.users(id) on delete set null,
  released_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  released_at  timestamptz
);
-- At most ONE active control per (org, scope, scope_id).
create unique index if not exists uq_dpc_active
  on public.distribution_publish_controls (org_id, scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'active';

alter table public.distribution_publish_controls enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_publish_controls' and policyname='dpc_select') then
    create policy dpc_select on public.distribution_publish_controls
      for select using (org_id = public.current_org_id());
  end if;
  -- Engaging or releasing an emergency stop is a manager action.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_publish_controls' and policyname='dpc_insert') then
    create policy dpc_insert on public.distribution_publish_controls
      for insert with check (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_publish_controls' and policyname='dpc_update') then
    create policy dpc_update on public.distribution_publish_controls
      for update using (org_id = public.current_org_id() and public.has_min_role('manager'))
      with check (org_id = public.current_org_id());
  end if;
end $$;
