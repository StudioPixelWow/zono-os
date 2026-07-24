-- ============================================================================
-- ZONO — Batch 6.8 · Meta Workspace — Phase 3A schema (Immediate Publishing).
-- ADDITIVE + IDEMPOTENT. No Phase-2 (or any frozen) table is altered. Org-scoped
-- RLS via public.current_org_id(); publish writes are service-role (the engine
-- runs server-side after role checks). NO token, signed URL, raw provider payload,
-- or media bytes are stored — only canonical ids, safe status, and safe metadata.
-- Immediate mode only: NO scheduled/queued/retry_wait/dead_letter states exist.
-- ============================================================================

-- ── Publish operation (one immediate command for an immutable draft version) ─
create table if not exists public.meta_publish_operation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  draft_id uuid not null references public.meta_content_draft(id) on delete cascade,
  draft_version_number integer not null,
  content_hash text not null,
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  mode text not null default 'immediate' check (mode in ('immediate')),
  status text not null default 'created'
    check (status in ('created','validating','ready','executing','partially_succeeded','succeeded','failed','cancelled','blocked')),
  target_count integer not null default 0,
  successful_target_count integer not null default 0,
  failed_target_count integer not null default 0,
  skipped_target_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  correlation_id text not null,
  idempotency_key text not null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_publish_operation_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_publish_operation_draft_idx on public.meta_publish_operation (org_id, draft_id);
create index if not exists meta_publish_operation_status_idx on public.meta_publish_operation (org_id, status);
-- Prevent two ACTIVE immediate operations for the same draft version (equivalent
-- target set is folded into idempotency_key; this guards the coarse case too).
create unique index if not exists meta_publish_operation_active_uq
  on public.meta_publish_operation (org_id, draft_id, draft_version_number)
  where status in ('created','validating','ready','executing');

-- ── Publish target (independent state for one canonical asset) ───────────────
create table if not exists public.meta_publish_target (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_operation_id uuid not null references public.meta_publish_operation(id) on delete cascade,
  draft_target_id uuid not null references public.meta_content_draft_target(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  asset_kind text not null check (asset_kind in ('page','instagram')),
  asset_id uuid not null,
  content_kind text not null,
  status text not null default 'pending'
    check (status in ('pending','validating','ready','executing','provider_processing','succeeded','failed','skipped','cancelled','blocked','manual_review_required')),
  capability_snapshot jsonb not null default '{}'::jsonb,
  validation_snapshot jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  provider_object_id text,
  provider_container_id text,
  provider_permalink text,
  safe_error_kind text,
  safe_error_message text,
  retryable boolean not null default false,
  retry_class text,
  started_at timestamptz,
  completed_at timestamptz,
  last_attempt_at timestamptz,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_publish_target_idem_uq unique (org_id, idempotency_key),
  constraint meta_publish_target_op_draft_uq unique (publish_operation_id, draft_target_id)
);
create index if not exists meta_publish_target_op_idx on public.meta_publish_target (org_id, publish_operation_id);
create index if not exists meta_publish_target_status_idx on public.meta_publish_target (org_id, status);

-- ── Publish attempt (immutable per-execution record) ────────────────────────
create table if not exists public.meta_publish_attempt (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_operation_id uuid not null references public.meta_publish_operation(id) on delete cascade,
  publish_target_id uuid not null references public.meta_publish_target(id) on delete cascade,
  attempt_number integer not null,
  initiated_by uuid references public.users(id) on delete set null,
  initiation_kind text not null check (initiation_kind in ('initial','manual_retry')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result text check (result is null or result in ('succeeded','failed','ambiguous','skipped','cancelled')),
  safe_error_kind text,
  retryable boolean,
  retry_class text,
  provider_code_category text,
  provider_request_id text,
  correlation_id text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint meta_publish_attempt_uq unique (publish_target_id, attempt_number)
);
create index if not exists meta_publish_attempt_target_idx on public.meta_publish_attempt (org_id, publish_target_id);

-- ── Provider object (canonical mapping after CONFIRMED provider creation) ────
create table if not exists public.meta_provider_object (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_operation_id uuid not null references public.meta_publish_operation(id) on delete cascade,
  publish_target_id uuid not null references public.meta_publish_target(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  asset_id uuid not null,
  provider_object_type text not null,
  external_object_id text not null,
  external_container_id text,
  permalink text,
  created_time timestamptz,
  provider_status text,
  last_verified_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_provider_object_uq unique (org_id, platform, external_object_id)
);
create index if not exists meta_provider_object_op_idx on public.meta_provider_object (org_id, publish_operation_id);

-- ── RLS — org read; writes service-role (engine runs server-side, role-checked) ─
do $$
declare t text;
begin
  foreach t in array array[
    'meta_publish_operation','meta_publish_target','meta_publish_attempt','meta_provider_object'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update policy: only the service role (which bypasses
    -- RLS) writes publishing state, after the service verifies publish permission.
  end loop;
end $$;
