-- ============================================================================
-- ZONO — Batch 6.9 · Social Intelligence & Engagement Platform — Phase 1 schema
-- (Comment Ingestion & Moderation).
-- ADDITIVE + IDEMPOTENT. No Batch-6.8 (or frozen) table is dropped or rewritten;
-- existing tables gain only NEW nullable columns. Org-scoped RLS for SELECT; every
-- comment / thread / action / job WRITE is service-role (trusted server) only.
-- Comments are PUBLIC content (author display + message text are safe to store);
-- NO token, app secret, raw Graph payload, signed media URL, media bytes, or
-- lease token is stored. The durable ingestion/moderation queue reuses the exact
-- Batch-6.8 lease/job conventions (one active job per anchor; SKIP LOCKED claim).
-- ============================================================================

-- ── meta_comment — one ingested comment (public content; provider is truth) ──
create table if not exists public.meta_comment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram')),
  external_comment_id text not null,
  external_parent_comment_id text,
  root_external_comment_id text,
  asset_external_id text,
  author_external_id text,
  author_display text,
  message_text text,
  attachments_safe jsonb not null default '[]'::jsonb,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  status text not null default 'visible' check (status in ('visible','hidden','deleted','unknown','pending')),
  is_from_page boolean not null default false,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  last_synced_at timestamptz,
  content_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_comment_extid_uq unique (org_id, platform, external_comment_id)
);
create index if not exists meta_comment_object_idx on public.meta_comment (org_id, provider_object_id);
create index if not exists meta_comment_status_idx on public.meta_comment (org_id, status);
create index if not exists meta_comment_root_idx on public.meta_comment (org_id, root_external_comment_id);

-- ── meta_comment_thread — per-root rollup for fast moderation views ──────────
create table if not exists public.meta_comment_thread (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  root_external_comment_id text not null,
  platform text not null check (platform in ('facebook','instagram')),
  reply_count integer not null default 0,
  last_activity_at timestamptz,
  page_replied boolean not null default false,
  has_unaddressed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_comment_thread_uq unique (org_id, root_external_comment_id)
);
create index if not exists meta_comment_thread_object_idx on public.meta_comment_thread (org_id, provider_object_id);

-- ── meta_engagement_action — an APPROVAL-GATED outbound moderation action ─────
-- Reply / hide / unhide / delete. NEVER auto-executes: an action is created in a
-- draft/pending approval state, executed by the worker only after approval, and a
-- provider WRITE is never auto-retried (an ambiguous outcome → manual review).
create table if not exists public.meta_engagement_action (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  action_kind text not null check (action_kind in ('reply','hide','unhide','delete')),
  platform text not null check (platform in ('facebook','instagram')),
  target_comment_id uuid not null references public.meta_comment(id) on delete cascade,
  provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  reply_text text,
  approval_state text not null default 'pending' check (approval_state in ('draft','pending','approved','rejected')),
  status text not null default 'pending'
    check (status in ('pending','ready','executing','provider_processing','succeeded','failed','manual_review_required','cancelled','blocked')),
  requested_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  provider_result_id text,
  safe_error_kind text,
  safe_error_message text,
  retryable boolean not null default false,
  retry_class text,
  attempt_count integer not null default 0,
  correlation_id text not null,
  idempotency_key text not null,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_engagement_action_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_engagement_action_comment_idx on public.meta_engagement_action (org_id, target_comment_id);
create index if not exists meta_engagement_action_status_idx on public.meta_engagement_action (org_id, status);
-- At most one ACTIVE action of a kind per target comment (no duplicate moderation).
create unique index if not exists meta_engagement_action_active_uq
  on public.meta_engagement_action (org_id, target_comment_id, action_kind)
  where status in ('pending','ready','executing','provider_processing');

-- ── meta_comment_ingestion_job — durable ingestion / moderation job ──────────
create table if not exists public.meta_comment_ingestion_job (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_kind text not null check (job_kind in ('comment_backfill','comment_sync','moderation_execute','moderation_confirm')),
  provider_object_id uuid references public.meta_provider_object(id) on delete cascade,
  target_comment_id uuid references public.meta_comment(id) on delete cascade,
  engagement_action_id uuid references public.meta_engagement_action(id) on delete cascade,
  webhook_event_id uuid references public.meta_webhook_event(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled','available','claimed','executing','retry_wait','succeeded','failed','dead_letter','blocked')),
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  cursor text,
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
  constraint meta_comment_ingestion_job_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_comment_ingestion_job_status_idx on public.meta_comment_ingestion_job (org_id, status);
create index if not exists meta_comment_ingestion_job_due_idx on public.meta_comment_ingestion_job (available_at, priority)
  where status in ('scheduled','available','retry_wait');
create index if not exists meta_comment_ingestion_job_lease_idx on public.meta_comment_ingestion_job (lease_expires_at)
  where status in ('claimed','executing');
-- One active job per (kind, anchor) — no duplicate backfill/sync/execute.
create unique index if not exists meta_comment_ingestion_job_active_uq
  on public.meta_comment_ingestion_job (org_id, job_kind, coalesce(engagement_action_id, target_comment_id, provider_object_id))
  where status in ('scheduled','available','claimed','executing','retry_wait');

-- ── Additive columns on meta_provider_object (engagement rollups) ────────────
alter table public.meta_provider_object
  add column if not exists last_engagement_at timestamptz,
  add column if not exists comment_count_cached integer not null default 0,
  add column if not exists comment_sync_due_at timestamptz;

-- ── RLS — org read; ALL writes service-role (trusted server code only) ───────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_comment','meta_comment_thread','meta_engagement_action','meta_comment_ingestion_job'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete policy: comment ingestion, thread
    -- rollups, moderation actions and jobs are service-role only, after the
    -- service verifies capability + role + approval.
  end loop;
end $$;

-- ── Distributed-safe claim — SAME SKIP LOCKED convention as Batch 6.8 ────────
create or replace function public.meta_comment_claim_due(
  p_now timestamptz,
  p_limit integer,
  p_per_org_max integer,
  p_lease_owner text,
  p_lease_seconds integer
) returns setof public.meta_comment_ingestion_job
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id,
           row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc, j.id asc) as org_rank
    from public.meta_comment_ingestion_job j
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
  ),
  eligible as (
    select id from due where org_rank <= greatest(1, p_per_org_max) order by id limit greatest(0, p_limit)
  ),
  locked as (
    select j.id from public.meta_comment_ingestion_job j
    join eligible e on e.id = j.id
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    for update skip locked
  ),
  claimed as (
    update public.meta_comment_ingestion_job j
    set status = 'claimed', lease_owner = p_lease_owner, lease_token = gen_random_uuid()::text,
        lease_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
        claimed_at = p_now, heartbeat_at = p_now, updated_at = now()
    from locked where j.id = locked.id
    returning j.*
  )
  select * from claimed;
end;
$$;
