-- ============================================================================
-- ZONO — Batch 6.8 · Meta Workspace — Phase 3C schema (Reconciliation, Webhooks,
-- Provider Verification, Drift Detection, Production Hardening).
-- ADDITIVE + IDEMPOTENT. No Phase-0/1/2/3A/3B (or frozen) table is dropped or
-- rewritten; existing tables gain only NEW nullable columns / indexes. Org-scoped
-- RLS for SELECT; every webhook / reconciliation / provider-state / discrepancy
-- WRITE is service-role (trusted server) only. Webhook identity is resolved from
-- provider evidence, NEVER a client-supplied org id — an UNMATCHED webhook row has
-- org_id NULL and is therefore invisible to every authenticated tenant (admin /
-- system only, via the service role) until it is confidently matched. NO token,
-- app secret, webhook signature, raw provider payload, signed media URL, or media
-- bytes is stored; any retained forensic payload is a size-bounded, whitelisted,
-- versioned sanitized subset only.
-- ============================================================================

-- ── meta_webhook_event — durable, deduplicated trusted delivery / event ──────
create table if not exists public.meta_webhook_event (
  id uuid primary key default gen_random_uuid(),
  -- NULL until the event is confidently matched to a canonical asset/object.
  org_id uuid references public.organizations(id) on delete cascade,
  provider text not null default 'meta',
  platform text check (platform is null or platform in ('facebook','instagram')),
  external_event_id text,
  -- Deterministic server-computed fingerprint (dedup when no stable event id).
  event_fingerprint text not null,
  event_type text not null,
  object_type text,
  external_object_id text,
  external_parent_id text,
  asset_external_id text,
  received_at timestamptz not null default now(),
  provider_created_at timestamptz,
  signature_verified boolean not null default false,
  payload_schema_version integer not null default 1,
  processing_status text not null default 'received'
    check (processing_status in ('received','verified','matched','processed','ignored','unmatched','retry_wait','failed','dead_letter')),
  matched_provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  matched_publish_target_id uuid references public.meta_publish_target(id) on delete set null,
  -- Size-bounded, whitelisted, versioned sanitized subset ONLY (never raw body).
  sanitized_payload jsonb,
  safe_error_kind text,
  retry_count integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Global (provider/app-context) dedup: prefer the stable provider event id,
  -- else the deterministic fingerprint. Both are unique so a replayed delivery
  -- never creates a second row — even before tenant resolution.
  constraint meta_webhook_event_extid_uq unique (provider, external_event_id),
  constraint meta_webhook_event_fp_uq unique (provider, event_fingerprint)
);
create index if not exists meta_webhook_event_status_idx on public.meta_webhook_event (processing_status, received_at);
create index if not exists meta_webhook_event_org_idx on public.meta_webhook_event (org_id, received_at desc);
create index if not exists meta_webhook_event_obj_idx on public.meta_webhook_event (external_object_id);

-- ── meta_reconciliation_job — durable verification job (reuses 3B lease model) ─
create table if not exists public.meta_reconciliation_job (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_kind text not null check (job_kind in ('post_publish_verify','ambiguous_outcome_verify','periodic_object_verify','webhook_followup','manual_verification')),
  publish_operation_id uuid references public.meta_publish_operation(id) on delete cascade,
  publish_target_id uuid references public.meta_publish_target(id) on delete cascade,
  provider_object_id uuid references public.meta_provider_object(id) on delete cascade,
  dead_letter_id uuid references public.meta_publish_dead_letter(id) on delete set null,
  webhook_event_id uuid references public.meta_webhook_event(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled','available','claimed','executing','retry_wait','verified','discrepancy_found','unresolved','cancelled','dead_letter')),
  reason text,
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 6,
  -- Confirmations accumulated toward an evidence threshold (e.g. not-published).
  confirmation_count integer not null default 0,
  -- Durable lease (identical fencing model to Phase 3B).
  lease_owner text,
  lease_token text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz,
  safe_error_kind text,
  correlation_id text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_reconciliation_job_idem_uq unique (org_id, idempotency_key)
);
create index if not exists meta_reconciliation_job_status_idx on public.meta_reconciliation_job (org_id, status);
create index if not exists meta_reconciliation_job_due_idx on public.meta_reconciliation_job (available_at, priority)
  where status in ('scheduled','available','retry_wait');
create index if not exists meta_reconciliation_job_lease_idx on public.meta_reconciliation_job (lease_expires_at)
  where status in ('claimed','executing');
-- One active reconciliation job per (object, reason) — no duplicate verification.
create unique index if not exists meta_reconciliation_job_active_uq
  on public.meta_reconciliation_job (org_id, job_kind, coalesce(provider_object_id, publish_target_id, publish_operation_id))
  where status in ('scheduled','available','claimed','executing','retry_wait');

-- ── meta_reconciliation_attempt — immutable inspection record ────────────────
create table if not exists public.meta_reconciliation_attempt (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  reconciliation_job_id uuid not null references public.meta_reconciliation_job(id) on delete cascade,
  publish_operation_id uuid references public.meta_publish_operation(id) on delete set null,
  publish_target_id uuid references public.meta_publish_target(id) on delete set null,
  provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  attempt_number integer not null,
  initiated_by uuid references public.users(id) on delete set null,
  initiation_kind text not null check (initiation_kind in ('automatic','webhook','manual','recovery')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result text,
  observed_provider_state text,
  safe_error_kind text,
  retry_class text,
  provider_request_id text,
  duration_ms integer,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint meta_reconciliation_attempt_uq unique (reconciliation_job_id, attempt_number)
);
create index if not exists meta_reconciliation_attempt_job_idx on public.meta_reconciliation_attempt (org_id, reconciliation_job_id);

-- ── meta_provider_object_state — append-only verified-state timeline ─────────
create table if not exists public.meta_provider_object_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_object_id uuid not null references public.meta_provider_object(id) on delete cascade,
  observed_at timestamptz not null default now(),
  state text not null check (state in ('exists','processing','published','inaccessible','deleted','hidden','permission_lost','unknown','ambiguous')),
  visibility_state text,
  provider_created_time timestamptz,
  provider_updated_time timestamptz,
  permalink text,
  external_parent_id text,
  evidence_kind text not null check (evidence_kind in ('provider_inspection','webhook','manual','recovery','publish_confirmation')),
  source_event_id uuid references public.meta_webhook_event(id) on delete set null,
  source_reconciliation_attempt_id uuid references public.meta_reconciliation_attempt(id) on delete set null,
  content_fingerprint text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists meta_provider_object_state_obj_idx on public.meta_provider_object_state (org_id, provider_object_id, observed_at desc);

-- ── meta_publish_discrepancy — first-class local/provider mismatch ───────────
create table if not exists public.meta_publish_discrepancy (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  publish_operation_id uuid references public.meta_publish_operation(id) on delete cascade,
  publish_target_id uuid references public.meta_publish_target(id) on delete cascade,
  provider_object_id uuid references public.meta_provider_object(id) on delete set null,
  discrepancy_type text not null check (discrepancy_type in (
    'local_success_provider_missing','local_processing_provider_published','local_failed_provider_exists',
    'ambiguous_provider_exists','ambiguous_provider_missing','provider_deleted','provider_hidden',
    'provider_inaccessible','provider_id_mismatch','permalink_changed','webhook_unmatched',
    'capability_lost_after_publish','verification_overdue','duplicate_provider_object','impossible_aggregate_state')),
  severity text not null check (severity in ('informational','warning','action_required','critical')),
  status text not null default 'open' check (status in ('open','monitoring','resolved','acknowledged','false_positive')),
  detected_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  evidence_count integer not null default 1,
  safe_summary text,
  auto_repairable boolean not null default false,
  repaired_at timestamptz,
  repaired_by uuid references public.users(id) on delete set null,
  resolution text,
  resolved_by uuid references public.users(id) on delete set null,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One live discrepancy per (target, type) — evidence accrues on it, not a flood.
  constraint meta_publish_discrepancy_live_uq unique (org_id, publish_target_id, discrepancy_type)
);
create index if not exists meta_publish_discrepancy_status_idx on public.meta_publish_discrepancy (org_id, status, severity);
create index if not exists meta_publish_discrepancy_op_idx on public.meta_publish_discrepancy (org_id, publish_operation_id);

-- ── Additive columns on existing publishing tables (no destructive change) ───
alter table public.meta_provider_object
  add column if not exists lifecycle_state text,
  add column if not exists last_verified_state text,
  add column if not exists verification_due_at timestamptz,
  add column if not exists verification_attempts integer not null default 0;
alter table public.meta_publish_operation
  add column if not exists verification_status text,
  add column if not exists last_verified_at timestamptz;
alter table public.meta_publish_target
  add column if not exists verification_status text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists provider_verified boolean not null default false;
alter table public.meta_publish_dead_letter
  add column if not exists reconciliation_resolved boolean not null default false,
  add column if not exists reconciliation_resolution text;

-- ── RLS — org read (NULL-org webhook rows are admin/system-only); writes SR ──
do $$
declare t text;
begin
  foreach t in array array[
    'meta_webhook_event','meta_reconciliation_job','meta_reconciliation_attempt',
    'meta_provider_object_state','meta_publish_discrepancy'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    -- org_id = current_org_id() : a NULL org_id (unmatched webhook) matches no
    -- tenant, so it is invisible to authenticated clients and reachable only by
    -- the service role (trusted operational admin / system).
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete policy: reconciliation, webhook and
    -- discrepancy writes are service-role only, after server-side authorization.
  end loop;
end $$;

-- ── Distributed-safe reconciliation claim — SAME SKIP LOCKED convention as the
--    Phase-3B publish queue, applied to the reconciliation job table (a separate
--    table for schema clarity; the lease/fencing semantics are identical). ─────
create or replace function public.meta_reconcile_claim_due(
  p_now timestamptz,
  p_limit integer,
  p_per_org_max integer,
  p_lease_owner text,
  p_lease_seconds integer
) returns setof public.meta_reconciliation_job
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id,
           row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc, j.id asc) as org_rank
    from public.meta_reconciliation_job j
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
  ),
  eligible as (
    select id from due where org_rank <= greatest(1, p_per_org_max) order by id limit greatest(0, p_limit)
  ),
  locked as (
    select j.id from public.meta_reconciliation_job j
    join eligible e on e.id = j.id
    where j.status in ('scheduled','available','retry_wait')
      and j.available_at <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    for update skip locked
  ),
  claimed as (
    update public.meta_reconciliation_job j
    set status = 'claimed', lease_owner = p_lease_owner, lease_token = gen_random_uuid()::text,
        lease_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
        claimed_at = p_now, heartbeat_at = p_now, updated_at = now()
    from locked where j.id = locked.id
    returning j.*
  )
  select * from claimed;
end;
$$;
