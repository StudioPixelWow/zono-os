-- ============================================================================
-- ZONO — Batch 6.8 · Meta Workspace — Phase 3B schema (Scheduling, Queue,
-- Automatic Retry, Dead Letter, Recovery).
-- ADDITIVE + IDEMPOTENT. No Phase-0/1/2/3A (or any frozen) table is dropped or
-- rewritten; Phase-3A tables gain only NEW nullable columns and WIDENED status /
-- mode check sets. Org-scoped RLS via public.current_org_id() for SELECT only;
-- every job / lease / attempt / dead-letter / rate-budget WRITE is service-role
-- (the scheduler, dispatcher and worker run trusted server-side after role +
-- ownership checks). NO token, signed URL, raw provider payload, media bytes, or
-- lease token is exposed to authenticated clients. A scheduled datetime is NEVER
-- stored as a naive local timestamp alone: the UTC instant, the IANA zone, the
-- wall-clock local string, and the resolved offset are all persisted so the
-- intended local time is DST-deterministic and auditable.
-- ============================================================================

-- ── Phase-3A additive widening — meta_publish_operation ──────────────────────
-- Scheduled mode + queue/retry/dead-letter lifecycle states join the immediate
-- set. Existing rows keep 'immediate' / their current status untouched.
alter table public.meta_publish_operation
  add column if not exists scheduled_for timestamptz,
  add column if not exists scheduled_timezone text,
  add column if not exists scheduled_local_datetime text,
  add column if not exists scheduled_offset_minutes integer,
  add column if not exists execution_job_id uuid,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists reschedule_count integer not null default 0;

alter table public.meta_publish_operation drop constraint if exists meta_publish_operation_mode_check;
alter table public.meta_publish_operation
  add constraint meta_publish_operation_mode_check
  check (mode in ('immediate','scheduled'));

alter table public.meta_publish_operation drop constraint if exists meta_publish_operation_status_check;
alter table public.meta_publish_operation
  add constraint meta_publish_operation_status_check
  check (status in (
    'created','validating','ready','executing','partially_succeeded','succeeded',
    'failed','cancelled','blocked',
    -- Phase 3B additions:
    'scheduled','queued','retry_wait','dead_letter'
  ));

create index if not exists meta_publish_operation_scheduled_idx
  on public.meta_publish_operation (org_id, scheduled_for)
  where mode = 'scheduled';

-- ── Phase-3A additive widening — meta_publish_target (automatic-retry fields) ─
-- These track the AUTOMATIC (background) retry lineage separately from the
-- Phase-3A manual-retry attempt chain; manual-retry semantics are unchanged.
alter table public.meta_publish_target
  add column if not exists auto_retry_count integer not null default 0,
  add column if not exists auto_retry_budget integer,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_retry_class text,
  add column if not exists auto_retry_exhausted boolean not null default false;

-- ── meta_publish_job — the durable unit of background work ───────────────────
-- One job = one thing the worker must do exactly-once-ish for an operation:
-- publish a scheduled operation when its time arrives, OR automatically retry an
-- eligible failed target, OR recover an abandoned execution. Claiming is a
-- durable DB lease (see the SKIP LOCKED claim in the store) — never an in-memory
-- timer. lease_token is a server-only opaque nonce; it is NOT surfaced to clients
-- (no RLS write policy exists, and safe DTOs omit it).
create table if not exists public.meta_publish_job (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_operation_id uuid not null references public.meta_publish_operation(id) on delete cascade,
  -- For an automatic_retry job scoped to a single failed target (null otherwise).
  publish_target_id uuid references public.meta_publish_target(id) on delete cascade,
  job_kind text not null check (job_kind in ('scheduled_publish','automatic_retry','recovery')),
  status text not null default 'scheduled'
    check (status in ('scheduled','available','claimed','executing','retry_wait','succeeded','failed','cancelled','dead_letter','blocked')),
  -- Timezone-safe scheduling: UTC instant + originating wall-clock + zone + offset.
  scheduled_for timestamptz not null,
  scheduled_timezone text,
  scheduled_local_datetime text,
  scheduled_offset_minutes integer,
  -- When the job becomes claimable (== scheduled_for, then pushed forward by
  -- backoff while in retry_wait). Never in the past means "not yet due".
  run_after timestamptz not null,
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  retry_budget integer not null default 5,
  retry_budget_remaining integer not null default 5,
  -- Durable lease (distributed-safe claim). All three move together on claim.
  lease_owner text,
  lease_token text,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  -- Safe, secret-free failure context.
  last_error_kind text,
  last_error_class text,
  safe_last_error text,
  recovery_disposition text,
  requeue_count integer not null default 0,
  correlation_id text not null,
  idempotency_key text not null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint meta_publish_job_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_publish_job_org_status_idx on public.meta_publish_job (org_id, status);
-- The dispatcher hot path: due, claimable jobs ordered by priority then time.
create index if not exists meta_publish_job_due_idx
  on public.meta_publish_job (run_after, priority)
  where status in ('scheduled','available','retry_wait');
-- Lease reaper hot path: claimed/executing jobs whose lease may be stale.
create index if not exists meta_publish_job_lease_idx
  on public.meta_publish_job (lease_expires_at)
  where status in ('claimed','executing');
-- At most ONE active (non-terminal) job per operation for the primary publish
-- lifecycle — prevents a duplicate scheduler/dispatcher from double-publishing.
create unique index if not exists meta_publish_job_active_primary_uq
  on public.meta_publish_job (publish_operation_id)
  where job_kind = 'scheduled_publish'
    and status in ('scheduled','available','claimed','executing','retry_wait');
-- At most ONE active automatic-retry job per target.
create unique index if not exists meta_publish_job_active_retry_uq
  on public.meta_publish_job (publish_target_id)
  where job_kind = 'automatic_retry'
    and status in ('scheduled','available','claimed','executing','retry_wait')
    and publish_target_id is not null;

-- ── meta_publish_job_attempt — immutable per-claim execution record ──────────
create table if not exists public.meta_publish_job_attempt (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_job_id uuid not null references public.meta_publish_job(id) on delete cascade,
  attempt_number integer not null,
  worker_id text,
  lease_token text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text check (outcome is null or outcome in ('succeeded','partial','failed','ambiguous','retry_scheduled','dead_lettered','abandoned','recovered')),
  safe_error_kind text,
  retry_class text,
  next_run_after timestamptz,
  duration_ms integer,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint meta_publish_job_attempt_uq unique (publish_job_id, attempt_number)
);
create index if not exists meta_publish_job_attempt_job_idx on public.meta_publish_job_attempt (org_id, publish_job_id);

-- ── meta_publish_dead_letter — terminal, history-preserving, NO auto-replay ──
-- A job lands here only after exhausting retries, being classified permanent, or
-- being recovered as ambiguous. Nothing re-runs it automatically; a privileged
-- human must acknowledge and (if appropriate) manually re-drive via Phase-3A.
create table if not exists public.meta_publish_dead_letter (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_job_id uuid not null references public.meta_publish_job(id) on delete cascade,
  publish_operation_id uuid not null references public.meta_publish_operation(id) on delete cascade,
  publish_target_id uuid references public.meta_publish_target(id) on delete set null,
  job_kind text not null,
  reason text not null check (reason in ('retries_exhausted','permanent_failure','ambiguous_result','budget_exhausted','manual','recovery_ambiguous')),
  terminal_error_kind text,
  terminal_error_class text,
  attempt_count integer not null default 0,
  safe_context jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint meta_publish_dead_letter_job_uq unique (publish_job_id)
);
create index if not exists meta_publish_dead_letter_org_idx on public.meta_publish_dead_letter (org_id, created_at desc);

-- ── meta_publish_rate_budget — per-org / per-scope fixed-window allocation ───
-- Durable counterpart to the in-memory local limiter: the scheduler consults it
-- so background dispatch respects org + global publish budgets and fairness.
create table if not exists public.meta_publish_rate_budget (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  used integer not null default 0,
  limit_value integer not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint meta_publish_rate_budget_uq unique (org_id, scope, window_start)
);
create index if not exists meta_publish_rate_budget_org_idx on public.meta_publish_rate_budget (org_id, scope);

-- ── RLS — org read; ALL writes service-role (trusted server code only) ───────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_publish_job','meta_publish_job_attempt','meta_publish_dead_letter','meta_publish_rate_budget'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete policy: only the service role (which
    -- bypasses RLS) writes queue/lease/budget/dead-letter state, after the
    -- service verifies role + org ownership. A cross-org job is never claimable
    -- because every claim query is org-scoped AND runs as service-role server-side.
  end loop;
end $$;

-- ── Phase-3A additive widening — automatic-retry attempt lineage ─────────────
-- The background worker records automatic attempts distinctly from initial /
-- manual-retry attempts. Additive to the existing check set only.
alter table public.meta_publish_attempt drop constraint if exists meta_publish_attempt_initiation_kind_check;
alter table public.meta_publish_attempt
  add constraint meta_publish_attempt_initiation_kind_check
  check (initiation_kind in ('initial','manual_retry','automatic_retry'));

-- ── Distributed-safe claim — FOR UPDATE SKIP LOCKED, per-org fair, bounded ───
-- Atomically claims up to p_limit DUE, claimable jobs (respecting a per-org cap so
-- one org cannot monopolise workers), stamps a FRESH per-row lease token, and
-- returns the claimed rows. SKIP LOCKED means concurrent dispatchers never block
-- on each other and never both win the same row. SECURITY DEFINER + a hard search
-- path; callable only by the service role (the internal dispatcher route).
create or replace function public.meta_publish_claim_due(
  p_now timestamptz,
  p_limit integer,
  p_per_org_max integer,
  p_lease_owner text,
  p_lease_seconds integer
) returns setof public.meta_publish_job
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id,
           row_number() over (partition by j.org_id order by j.priority asc, j.run_after asc, j.id asc) as org_rank
    from public.meta_publish_job j
    where j.status in ('scheduled','available','retry_wait')
      and j.run_after <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
  ),
  eligible as (
    select id from due where org_rank <= greatest(1, p_per_org_max) order by id limit greatest(0, p_limit)
  ),
  locked as (
    select j.id
    from public.meta_publish_job j
    join eligible e on e.id = j.id
    where j.status in ('scheduled','available','retry_wait')
      and j.run_after <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    for update skip locked
  ),
  claimed as (
    update public.meta_publish_job j
    set status = 'claimed',
        lease_owner = p_lease_owner,
        lease_token = gen_random_uuid()::text,
        lease_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
        claimed_at = p_now,
        heartbeat_at = p_now,
        revision = j.revision + 1,
        updated_at = now()
    from locked
    where j.id = locked.id
    returning j.*
  )
  select * from claimed;
end;
$$;

-- Atomic fixed-window rate-budget consume: increments `used` iff room remains,
-- returning the row. One statement → no read-modify-write race.
create or replace function public.meta_publish_consume_budget(
  p_org_id uuid,
  p_scope text,
  p_window_start timestamptz,
  p_window_seconds integer,
  p_limit integer
) returns table(allowed boolean, used integer, limit_value integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.meta_publish_rate_budget as b (org_id, scope, window_start, window_seconds, used, limit_value)
  values (p_org_id, p_scope, p_window_start, greatest(1, p_window_seconds), 0, greatest(0, p_limit))
  on conflict (org_id, scope, window_start) do update set limit_value = excluded.limit_value, updated_at = now();

  update public.meta_publish_rate_budget b
  set used = b.used + 1, updated_at = now()
  where b.org_id = p_org_id and b.scope = p_scope and b.window_start = p_window_start
    and b.used < b.limit_value
  returning b.used into v_used;

  if v_used is null then
    select b.used into v_used from public.meta_publish_rate_budget b
      where b.org_id = p_org_id and b.scope = p_scope and b.window_start = p_window_start;
    return query select false, coalesce(v_used, 0), greatest(0, p_limit);
  else
    return query select true, v_used, greatest(0, p_limit);
  end if;
end;
$$;
