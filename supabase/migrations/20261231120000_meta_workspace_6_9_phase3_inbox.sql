-- ============================================================================
-- ZONO — Batch 6.9 · Social Intelligence & Engagement Platform — Phase 3 schema
-- (Unified Inbox).
-- ADDITIVE + IDEMPOTENT. No Batch-6.8 / 6.9-P1 / 6.9-P2 (or frozen) table is
-- dropped or rewritten. The inbox is a CANONICAL, Meta-scoped projection over the
-- already-ingested comment data (Phase 1) — it does NOT duplicate the Communication
-- OS conversation model, and it never stores a Graph model, token, raw payload, or
-- signed URL. Org-scoped RLS for SELECT; every inbox / label / assignment / sync
-- WRITE is service-role (trusted server) only. The durable incremental cursor-sync
-- queue reuses the Batch-6.8 lease/job conventions (one active sync per org+
-- platform; SKIP LOCKED claim; bounded batches — no full scan).
-- ============================================================================

-- ── meta_inbox_conversation — the unified engagement unit ────────────────────
-- Source-agnostic by design (Phase 3 sources = comment threads; later phases may
-- add messages/mentions). It REFERENCES the canonical comment thread + post; it
-- does not copy comment content beyond a safe preview snippet.
create table if not exists public.meta_inbox_conversation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_kind text not null default 'comment_thread' check (source_kind in ('comment_thread')),
  source_ref text not null,                -- root_external_comment_id (thread key)
  platform text not null check (platform in ('facebook','instagram')),
  provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  participant_external_id text,
  participant_display text,
  subject_preview text,
  reply_count integer not null default 0,
  last_activity_at timestamptz,
  last_read_at timestamptz,
  unread boolean not null default true,
  status text not null default 'open' check (status in ('open','snoozed','archived','resolved')),
  snoozed_until timestamptz,
  assignee_user_id uuid references public.users(id) on delete set null,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_inbox_conversation_uq unique (org_id, source_kind, source_ref)
);
create index if not exists meta_inbox_conversation_status_idx on public.meta_inbox_conversation (org_id, status, last_activity_at desc);
create index if not exists meta_inbox_conversation_assignee_idx on public.meta_inbox_conversation (org_id, assignee_user_id);
create index if not exists meta_inbox_conversation_unread_idx on public.meta_inbox_conversation (org_id, unread) where unread = true;
create index if not exists meta_inbox_conversation_object_idx on public.meta_inbox_conversation (org_id, provider_object_id);

-- ── meta_inbox_label — the org's label catalogue + join ──────────────────────
create table if not exists public.meta_inbox_label (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  constraint meta_inbox_label_uq unique (org_id, name)
);
create table if not exists public.meta_inbox_conversation_label (
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.meta_inbox_conversation(id) on delete cascade,
  label_id uuid not null references public.meta_inbox_label(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, label_id)
);
create index if not exists meta_inbox_conversation_label_org_idx on public.meta_inbox_conversation_label (org_id, label_id);

-- ── meta_inbox_assignment — assignment history (audit trail) ─────────────────
create table if not exists public.meta_inbox_assignment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.meta_inbox_conversation(id) on delete cascade,
  assignee_user_id uuid references public.users(id) on delete set null,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);
create index if not exists meta_inbox_assignment_conv_idx on public.meta_inbox_assignment (org_id, conversation_id);

-- ── meta_inbox_sync_state — incremental cursor per org+platform ──────────────
create table if not exists public.meta_inbox_sync_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  cursor_updated_at timestamptz,          -- last synced thread updated_at
  last_synced_at timestamptz,
  synced_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_inbox_sync_state_uq unique (org_id, platform)
);

-- ── meta_inbox_sync_job — durable incremental sync job (reuses 6.8 lease) ─────
create table if not exists public.meta_inbox_sync_job (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
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
  constraint meta_inbox_sync_job_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_inbox_sync_job_status_idx on public.meta_inbox_sync_job (org_id, status);
create index if not exists meta_inbox_sync_job_due_idx on public.meta_inbox_sync_job (available_at, priority)
  where status in ('scheduled','available','retry_wait');
create index if not exists meta_inbox_sync_job_lease_idx on public.meta_inbox_sync_job (lease_expires_at)
  where status in ('claimed','executing');
-- One active sync job per (org, platform) — no duplicate incremental sync.
create unique index if not exists meta_inbox_sync_job_active_uq
  on public.meta_inbox_sync_job (org_id, platform)
  where status in ('scheduled','available','claimed','executing','retry_wait');

-- ── RLS — org read; ALL writes service-role (trusted server code only) ───────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_inbox_conversation','meta_inbox_label','meta_inbox_conversation_label',
    'meta_inbox_assignment','meta_inbox_sync_state','meta_inbox_sync_job'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete policy: inbox conversation projection,
    -- labels, assignment, and sync state/jobs are service-role writes only, after
    -- the service verifies capability + role. Inbox STATE actions (read/archive/
    -- assign/label) are local mutations — they never touch Meta.
  end loop;
end $$;

-- ── Distributed-safe claim — SAME SKIP LOCKED convention as Batch 6.8 ────────
create or replace function public.meta_inbox_claim_due(
  p_now timestamptz,
  p_limit integer,
  p_per_org_max integer,
  p_lease_owner text,
  p_lease_seconds integer
) returns setof public.meta_inbox_sync_job
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id,
           row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc, j.id asc) as org_rank
    from public.meta_inbox_sync_job j
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
  ),
  eligible as (
    select id from due where org_rank <= greatest(1, p_per_org_max) order by id limit greatest(0, p_limit)
  ),
  locked as (
    select j.id from public.meta_inbox_sync_job j
    join eligible e on e.id = j.id
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    for update skip locked
  ),
  claimed as (
    update public.meta_inbox_sync_job j
    set status = 'claimed', lease_owner = p_lease_owner, lease_token = gen_random_uuid()::text,
        lease_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
        claimed_at = p_now, heartbeat_at = p_now, updated_at = now()
    from locked where j.id = locked.id
    returning j.*
  )
  select * from claimed;
end;
$$;
