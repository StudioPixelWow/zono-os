-- ============================================================================
-- 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 4 · Engagement Intelligence.
-- ----------------------------------------------------------------------------
-- Additive, idempotent. Adds the engagement-intelligence layer OVER the Phase-3
-- unified inbox: append-only classification signals, bounded next-best-action
-- suggestions, and a durable scoring job queue (reusing the Batch-6.8 lease /
-- retry / SKIP-LOCKED conventions). NOTHING here stores a token, raw prompt, raw
-- model response, webhook payload, or Graph model — only references + derived,
-- provider-neutral signals. Historic signals are NEVER updated in place; a new
-- score supersedes the prior one (append-only), and at most one CURRENT signal +
-- a bounded set of ACTIVE suggestions exist per inbox subject via partial indexes.
-- No destructive change; no rewrite of Batch 6.8 / Phase 1–3 data.
-- ============================================================================

-- ── Append-only classification signals ──────────────────────────────────────
create table if not exists public.meta_engagement_signal (
  id uuid primary key,
  org_id uuid not null,
  inbox_conversation_id uuid,                -- references the Phase-3 conversation (nullable for subject-only)
  subject_kind text not null default 'comment_thread',
  subject_ref text not null,                 -- canonical subject reference (thread key)
  -- Provider-neutral classification (taxonomy validated in code).
  sentiment text not null default 'unknown',
  sentiment_score integer not null default 0,     -- -100..100 (0 = neutral/unknown)
  intent text not null default 'unknown',
  urgency text not null default 'normal',
  confidence integer not null default 0,          -- 0..100
  -- Safe model provenance (never a key/prompt/response).
  model_provider_safe text,
  model_name_safe text,
  model_version_safe text,
  prompt_template_version text,
  -- Idempotency + versioning.
  content_fingerprint text not null,
  supersedes_signal_id uuid,                  -- the prior signal this one replaces
  is_current boolean not null default true,   -- exactly one current per subject (partial unique below)
  processing_state text not null default 'scored',  -- pending | scored | failed | superseded
  safe_error_kind text,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists meta_engagement_signal_subject_idx on public.meta_engagement_signal (org_id, subject_kind, subject_ref, computed_at desc);
create index if not exists meta_engagement_signal_conv_idx on public.meta_engagement_signal (org_id, inbox_conversation_id);
-- At most ONE current signal per (org, subject). Append-only history: older rows
-- are flipped is_current=false when superseded, so this never blocks a new score.
create unique index if not exists meta_engagement_signal_current_uq
  on public.meta_engagement_signal (org_id, subject_kind, subject_ref)
  where is_current = true;

-- ── Bounded next-best-action suggestions ────────────────────────────────────
create table if not exists public.meta_next_best_action (
  id uuid primary key,
  org_id uuid not null,
  inbox_conversation_id uuid not null,
  engagement_signal_id uuid not null,
  action_kind text not null,                  -- taxonomy validated in code
  rationale_safe text,                        -- provider-neutral, content-free rationale
  suggested_draft_ref text,                   -- reference to a reviewable Copilot draft (never the text itself here)
  confidence integer not null default 0,      -- 0..100
  status text not null default 'suggested',   -- suggested | accepted | dismissed | expired
  accepted_by uuid,
  accepted_at timestamptz,
  dismissed_by uuid,
  dismissed_at timestamptz,
  dismiss_reason_safe text,
  routed_ref text,                            -- id of the existing workflow object accept routed into
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meta_nba_conv_idx on public.meta_next_best_action (org_id, inbox_conversation_id, status);
create index if not exists meta_nba_signal_idx on public.meta_next_best_action (org_id, engagement_signal_id);
-- One ACTIVE (suggested) suggestion per (conversation, action_kind, signal) — dedup.
create unique index if not exists meta_nba_active_uq
  on public.meta_next_best_action (org_id, inbox_conversation_id, engagement_signal_id, action_kind)
  where status = 'suggested';

-- ── Durable scoring job queue (reuses Batch-6.8 conventions) ────────────────
create table if not exists public.meta_intelligence_job (
  id uuid primary key,
  org_id uuid not null,
  inbox_conversation_id uuid not null,
  subject_kind text not null default 'comment_thread',
  subject_ref text not null,
  job_kind text not null default 'score_conversation',  -- score_conversation | rescore_conversation | generate_suggestions | expire_suggestions
  status text not null default 'scheduled',   -- scheduled|available|claimed|executing|retry_wait|succeeded|failed|dead_letter|blocked
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  content_fingerprint text,                   -- the subject fingerprint this job scores (idempotency)
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
  correlation_id text not null default '',
  idempotency_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meta_intel_job_due_idx on public.meta_intelligence_job (status, available_at);
create index if not exists meta_intel_job_org_idx on public.meta_intelligence_job (org_id, status);
create unique index if not exists meta_intel_job_idem_uq on public.meta_intelligence_job (org_id, idempotency_key) where idempotency_key <> '';
-- One active scoring job per (org, subject): a burst of triggers coalesces.
create unique index if not exists meta_intel_job_active_uq
  on public.meta_intelligence_job (org_id, subject_kind, subject_ref)
  where status in ('scheduled','available','claimed','executing','retry_wait');

-- ── SKIP-LOCKED claim RPC (SECURITY DEFINER; per-org fair, bounded) ─────────
create or replace function public.meta_intelligence_claim_due(
  p_now timestamptz, p_limit integer, p_per_org_max integer, p_lease_owner text, p_lease_seconds integer
) returns setof public.meta_intelligence_job
language plpgsql security definer set search_path = public as $$
declare r public.meta_intelligence_job;
begin
  for r in
    with due as (
      select j.*, row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc) as rn
      from public.meta_intelligence_job j
      where j.status in ('scheduled','available','retry_wait')
        and j.available_at <= p_now
        and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    )
    select * from due where rn <= p_per_org_max order by priority asc, available_at asc limit p_limit
    for update skip locked
  loop
    update public.meta_intelligence_job
      set status = 'claimed', lease_owner = p_lease_owner,
          lease_token = gen_random_uuid()::text,
          lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
          claimed_at = p_now, heartbeat_at = p_now, updated_at = now()
      where id = r.id
      returning * into r;
    return next r;
  end loop;
  return;
end $$;

-- ── RLS — org read; ALL writes service-role (trusted server code only) ───────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_engagement_signal','meta_next_best_action','meta_intelligence_job'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete policy: signals, suggestions and jobs
    -- are service-role writes only, after the server verifies capability + role.
    -- AI outputs are suggestions — acceptance routes into existing approval-gated
    -- workflows and never executes a provider write.
  end loop;
end $$;
