-- ============================================================================
-- ZONO — Facebook Groups: P0 canonical publishing safety (ADDITIVE, IDEMPOTENT).
-- ----------------------------------------------------------------------------
-- Establishes distribution_posts as the ONE canonical per-group execution/result
-- record under distribution_campaigns:
--     distribution_campaigns → distribution_posts → distribution_publish_jobs
--                                                  → distribution_publish_events
-- No new queue, no parallel state machine. Reuses the EXISTING distribution_publish_events
-- (append-only audit, target_id→posts) and distribution_publish_controls (emergency stop).
-- Ports the content_hash duplicate-post guarantee off the parallel distribution_group_posts.
--
-- Safety guarantees added here (DB-enforced, not app-only):
--   • Idempotency: at most one post per (org, idempotency_key).
--   • Duplicate-post: at most one post per (org, group, content_hash) — race-safe.
--   • Atomic claim: one eligible post → one extension instance (FOR UPDATE SKIP
--     LOCKED), with agent (user) isolation + emergency-stop enforcement.
--   • Emergency stop: at most one ACTIVE control per (org, scope, scope_id).
--   • Append-only audit: distribution_publish_events cannot be updated/deleted.
--
-- Backward-compatible: all columns nullable/defaulted; existing rows untouched;
-- the live extension keeps working (legacy rows get assigned_user_id backfilled).
-- ============================================================================

-- ── 1) Canonical per-group execution columns on distribution_posts ───────────
alter table public.distribution_posts
  add column if not exists content_hash        text,
  add column if not exists claimed_at          timestamptz,
  add column if not exists locked_by           uuid,          -- extension instance holding the claim
  add column if not exists lease_expires_at    timestamptz,
  add column if not exists dispatched_at        timestamptz,
  add column if not exists started_at           timestamptz,
  add column if not exists completed_at         timestamptz,
  add column if not exists paused_at            timestamptz,
  add column if not exists dead_lettered_at     timestamptz,
  add column if not exists next_retry_at        timestamptz,
  add column if not exists max_attempts         integer not null default 5,
  add column if not exists duration_ms          integer,
  add column if not exists failure_code         text,
  add column if not exists failure_category     text,
  add column if not exists confirmation_source  text,          -- user|provider|extension|reconciliation
  add column if not exists assigned_user_id     uuid;          -- agent isolation: whose extension may claim

update public.distribution_posts
   set assigned_user_id = created_by
 where assigned_user_id is null and created_by is not null;

-- ── 2) DB-enforced idempotency + duplicate-post prevention ───────────────────
create unique index if not exists uq_dposts_org_idem
  on public.distribution_posts (org_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists uq_dposts_org_group_content
  on public.distribution_posts (org_id, group_id, content_hash)
  where content_hash is not null and group_id is not null;

-- ── 3) Claim / retry scan indexes ────────────────────────────────────────────
create index if not exists idx_dposts_claim
  on public.distribution_posts (org_id, assigned_user_id, publish_state, scheduled_at)
  where terminal is not true;
create index if not exists idx_dposts_next_retry
  on public.distribution_posts (next_retry_at)
  where next_retry_at is not null;

-- ── 4) Emergency stop: one ACTIVE control per (org, scope, scope_id) ──────────
create unique index if not exists uq_dpc_active
  on public.distribution_publish_controls
     (org_id, scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'active';
create index if not exists idx_dpc_org_state
  on public.distribution_publish_controls (org_id, state);

-- ── 5) Append-only audit history (defense-in-depth) ──────────────────────────
create index if not exists idx_dpe_target on public.distribution_publish_events (target_id, occurred_at);
create index if not exists idx_dpe_org    on public.distribution_publish_events (org_id, occurred_at desc);
create unique index if not exists uq_dpe_callback
  on public.distribution_publish_events (org_id, callback_id)
  where callback_id is not null;

create or replace function public.zono_forbid_mutation() returns trigger
  language plpgsql as $fn$
begin
  raise exception 'distribution_publish_events is append-only';
end;
$fn$;
drop trigger if exists trg_dpe_append_only on public.distribution_publish_events;
create trigger trg_dpe_append_only
  before update or delete on public.distribution_publish_events
  for each row execute function public.zono_forbid_mutation();

-- ── 6) Atomic claim: ONE eligible post → ONE extension instance ──────────────
create or replace function public.claim_next_distribution_post(
  p_org uuid, p_user uuid, p_instance uuid, p_lease_seconds integer default 300
) returns public.distribution_posts
  language plpgsql security definer set search_path = public as $fn$
declare
  v_row  public.distribution_posts;
  v_from text;
begin
  if exists (
    select 1 from public.distribution_publish_controls c
    where c.org_id = p_org and c.state = 'active'
      and c.scope in ('all','organization','org')
  ) then
    return null;
  end if;

  select * into v_row
  from public.distribution_posts p
  where p.org_id = p_org
    and coalesce(p.assigned_user_id, p_user) = p_user
    and p.terminal is not true
    and coalesce(p.publish_state, 'queued') in ('queued','scheduled','draft')
    and (p.scheduled_at is null or p.scheduled_at <= now())
    and p.paused_at is null
    and (p.lease_expires_at is null or p.lease_expires_at < now())
    and (p.group_id is not null
         or (p.metadata->>'channel_kind') in ('facebook_group','facebook_marketplace'))
    and not exists (
      select 1 from public.distribution_publish_controls c
      where c.org_id = p_org and c.state = 'active'
        and ( (c.scope = 'group'    and c.scope_id = p.group_id)
           or (c.scope = 'campaign' and c.scope_id = p.campaign_id)
           or (c.scope = 'property' and c.scope_id = p.property_id) )
    )
  order by p.scheduled_at nulls first, p.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  v_from := coalesce(v_row.publish_state, 'queued');

  update public.distribution_posts
     set publish_state    = 'dispatching',
         status           = 'publishing',
         claimed_at       = now(),
         dispatched_at    = now(),
         locked_by        = p_instance,
         assigned_user_id = coalesce(assigned_user_id, p_user),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempt_count    = coalesce(attempt_count, 0) + 1,
         updated_at       = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.distribution_publish_events
    (org_id, target_id, from_state, to_state, kind, actor_id, reason)
  values
    (p_org, v_row.id, v_from, 'dispatching', 'claim', p_user,
     'atomic claim by extension instance');

  return v_row;
end;
$fn$;

comment on function public.claim_next_distribution_post is
  'P0: atomically claim ONE eligible per-group distribution_posts row for ONE extension instance (org + agent isolated, emergency-stop aware, FOR UPDATE SKIP LOCKED). Never serves the same post to two workers.';
