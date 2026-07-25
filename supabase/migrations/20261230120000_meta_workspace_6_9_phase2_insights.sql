-- ============================================================================
-- ZONO — Batch 6.9 · Social Intelligence & Engagement Platform — Phase 2 schema
-- (Insights & Analytics).
-- ADDITIVE + IDEMPOTENT. No Batch-6.8 / 6.9-P1 (or frozen) table is dropped or
-- rewritten. Insight snapshots are an APPEND-ONLY time series (a metric value at
-- an observed instant) — never updated in place, so history is preserved and the
-- series is auditable. Org-scoped RLS for SELECT; every insight / refresh WRITE is
-- service-role (trusted server) only. NO token, app secret, raw Graph payload,
-- signed URL, media bytes, or lease token is stored. The durable refresh queue
-- reuses the Batch-6.8 lease/job conventions (one active job per subject; SKIP
-- LOCKED claim). Refresh is BOUNDED (decaying cadence, quiesce for stable/old
-- objects) — there is no unbounded polling and no full-table scan.
-- ============================================================================

-- ── meta_object_insight — append-only post-level metric snapshot ─────────────
create table if not exists public.meta_object_insight (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_object_id uuid not null references public.meta_provider_object(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  metric_key text not null,
  period text not null default 'lifetime' check (period in ('lifetime','day','week','days_28')),
  metric_value numeric not null default 0,
  observed_at timestamptz not null default now(),
  evidence_kind text not null default 'provider_inspection' check (evidence_kind in ('provider_inspection','manual','recovery')),
  source_refresh_job_id uuid,
  created_at timestamptz not null default now(),
  constraint meta_object_insight_uq unique (org_id, provider_object_id, metric_key, period, observed_at)
);
create index if not exists meta_object_insight_series_idx on public.meta_object_insight (org_id, provider_object_id, metric_key, observed_at desc);

-- ── meta_account_insight — append-only account/Page-level metric snapshot ────
create table if not exists public.meta_account_insight (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  platform text not null check (platform in ('facebook','instagram')),
  metric_key text not null,
  period text not null default 'day' check (period in ('lifetime','day','week','days_28')),
  metric_value numeric not null default 0,
  observed_at timestamptz not null default now(),
  evidence_kind text not null default 'provider_inspection' check (evidence_kind in ('provider_inspection','manual','recovery')),
  source_refresh_job_id uuid,
  created_at timestamptz not null default now(),
  constraint meta_account_insight_uq unique (org_id, asset_id, metric_key, period, observed_at)
);
create index if not exists meta_account_insight_series_idx on public.meta_account_insight (org_id, asset_id, metric_key, observed_at desc);

-- ── meta_insight_refresh_state — per-subject cadence cursor (bounds polling) ──
create table if not exists public.meta_insight_refresh_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('object','account')),
  subject_ref uuid not null,          -- provider_object_id or asset_id
  platform text not null check (platform in ('facebook','instagram')),
  first_observed_at timestamptz,
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz,
  refresh_count integer not null default 0,
  quiesced boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_insight_refresh_state_uq unique (org_id, subject_kind, subject_ref)
);
create index if not exists meta_insight_refresh_state_due_idx on public.meta_insight_refresh_state (next_refresh_at) where quiesced = false;

-- ── meta_insight_refresh_job — durable refresh job (reuses 6.8 lease model) ───
create table if not exists public.meta_insight_refresh_job (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_kind text not null check (job_kind in ('object_insight_refresh','account_insight_refresh')),
  subject_kind text not null check (subject_kind in ('object','account')),
  subject_ref uuid not null,
  platform text not null check (platform in ('facebook','instagram')),
  status text not null default 'scheduled'
    check (status in ('scheduled','available','claimed','executing','retry_wait','succeeded','failed','dead_letter','blocked')),
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 6,
  retry_budget_remaining integer not null default 6,
  requeue_count integer not null default 0,
  lease_owner text,
  lease_token text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz,
  last_error_kind text,
  safe_last_error text,
  correlation_id text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_insight_refresh_job_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_insight_refresh_job_status_idx on public.meta_insight_refresh_job (org_id, status);
create index if not exists meta_insight_refresh_job_due_idx on public.meta_insight_refresh_job (available_at, priority)
  where status in ('scheduled','available','retry_wait');
create index if not exists meta_insight_refresh_job_lease_idx on public.meta_insight_refresh_job (lease_expires_at)
  where status in ('claimed','executing');
-- One active refresh job per subject — no duplicate polling.
create unique index if not exists meta_insight_refresh_job_active_uq
  on public.meta_insight_refresh_job (org_id, subject_kind, subject_ref)
  where status in ('scheduled','available','claimed','executing','retry_wait');

-- ── Additive columns on meta_provider_object (insight cursor) ────────────────
alter table public.meta_provider_object
  add column if not exists insight_refresh_due_at timestamptz,
  add column if not exists last_insight_at timestamptz;

-- ── RLS — org read; ALL writes service-role (trusted server code only) ───────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_object_insight','meta_account_insight','meta_insight_refresh_state','meta_insight_refresh_job'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete policy: insight snapshots + refresh
    -- state/jobs are service-role writes only, after the service verifies the
    -- analytics capability + role. Snapshots are append-only (never updated).
  end loop;
end $$;

-- ── Distributed-safe claim — SAME SKIP LOCKED convention as Batch 6.8 ────────
create or replace function public.meta_insight_claim_due(
  p_now timestamptz,
  p_limit integer,
  p_per_org_max integer,
  p_lease_owner text,
  p_lease_seconds integer
) returns setof public.meta_insight_refresh_job
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id,
           row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc, j.id asc) as org_rank
    from public.meta_insight_refresh_job j
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
  ),
  eligible as (
    select id from due where org_rank <= greatest(1, p_per_org_max) order by id limit greatest(0, p_limit)
  ),
  locked as (
    select j.id from public.meta_insight_refresh_job j
    join eligible e on e.id = j.id
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    for update skip locked
  ),
  claimed as (
    update public.meta_insight_refresh_job j
    set status = 'claimed', lease_owner = p_lease_owner, lease_token = gen_random_uuid()::text,
        lease_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
        claimed_at = p_now, heartbeat_at = p_now, updated_at = now()
    from locked where j.id = locked.id
    returning j.*
  )
  select * from claimed;
end;
$$;
