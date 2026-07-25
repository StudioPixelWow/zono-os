-- ============================================================================
-- 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 6 · Messenger + Instagram DM.
-- ----------------------------------------------------------------------------
-- Additive, idempotent. Meta-SUPPORTED messaging (Facebook Messenger + Instagram
-- Direct) for CONNECTED assets only. Message bodies are SENSITIVE: stored AES-256-
-- GCM encrypted at rest (ciphertext columns) — NOTHING here stores plaintext bodies,
-- tokens, encryption keys, raw Graph payloads, webhook signatures, or AI output. All
-- OUTBOUND messages are APPROVAL-GATED, window-checked (24h + Human Agent), policy-
-- tag-validated, and sent via a single provider write (never auto-retried). A durable
-- job queue reuses the Batch-6.8 lease/retry/SKIP-LOCKED conventions. No destructive
-- change; no rewrite of Phase 1–5 data; no second Communication OS model (linkage is
-- a soft reference only).
-- ============================================================================

-- ── DM conversations (canonical; one per (org, platform, external thread)) ───
create table if not exists public.meta_dm_conversation (
  id uuid primary key,
  org_id uuid not null,
  platform text not null,                       -- facebook | instagram
  asset_id uuid not null,                        -- connected meta_page / meta_instagram_account
  external_thread_id text not null,              -- provider conversation/thread id
  participant_external_id text,
  participant_display_safe text,
  last_inbound_at timestamptz,                   -- drives the 24h standard messaging window
  last_message_at timestamptz,
  last_preview_ciphertext text,                  -- encrypted last-message preview (never plaintext)
  unread boolean not null default true,
  status text not null default 'open',           -- open | assigned | snoozed | resolved
  assignee_user_id uuid,
  inbox_conversation_id uuid,                     -- Phase-3 inbox projection reference
  comm_os_thread_ref text,                        -- soft linkage to Communication OS (reference only)
  intelligence_signal_ref text,                   -- Phase-4 derived signal reference (never AI text)
  cursor_ref text,                                -- opaque provider-isolated message cursor
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists meta_dm_conversation_uq on public.meta_dm_conversation (org_id, platform, external_thread_id);
create index if not exists meta_dm_conversation_feed_idx on public.meta_dm_conversation (org_id, status, last_message_at desc);

-- ── DM messages (bodies ENCRYPTED at rest) ───────────────────────────────────
create table if not exists public.meta_dm_message (
  id uuid primary key,
  org_id uuid not null,
  conversation_id uuid not null,
  external_message_id text not null,
  direction text not null,                        -- inbound | outbound
  sender_external_id text,
  body_ciphertext text,                           -- AES-256-GCM (v1:...) — NEVER plaintext
  attachments_safe jsonb not null default '[]'::jsonb,
  policy_tag text,                                -- Meta messaging policy tag (outbound only)
  delivery_state text,                            -- outbound: pending|sent|delivered|read|failed
  send_id uuid,                                   -- link to the approval-gated send record
  provider_created_at timestamptz,
  content_fingerprint text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists meta_dm_message_dedup_uq on public.meta_dm_message (org_id, conversation_id, external_message_id);
create index if not exists meta_dm_message_conv_idx on public.meta_dm_message (org_id, conversation_id, provider_created_at asc);

-- ── Outbound sends (APPROVAL-GATED; single provider write, never auto-retried) ─
create table if not exists public.meta_dm_send (
  id uuid primary key,
  org_id uuid not null,
  conversation_id uuid not null,
  draft_body_ciphertext text not null,            -- encrypted draft body (never plaintext)
  policy_tag text,                                -- validated supported tag, when required
  window_state text not null default 'unknown',   -- within_24h | human_agent | tag_permitted | expired
  approval_state text not null default 'pending', -- pending | approved | rejected
  status text not null default 'pending',         -- pending | ready | sent | failed | manual_review
  requested_by uuid,
  approved_by uuid,
  provider_message_id text,                        -- set on confirmed delivery
  safe_error_kind text,
  attempt_count integer not null default 0,
  correlation_id text not null default '',
  idempotency_key text not null default '',
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists meta_dm_send_conv_idx on public.meta_dm_send (org_id, conversation_id, status);
create unique index if not exists meta_dm_send_idem_uq on public.meta_dm_send (org_id, idempotency_key) where idempotency_key <> '';

-- ── Durable messaging job queue (reuses Batch-6.8 conventions) ───────────────
create table if not exists public.meta_messaging_job (
  id uuid primary key,
  org_id uuid not null,
  conversation_id uuid,
  send_id uuid,
  job_kind text not null default 'dm_message_sync',  -- dm_conversation_sync|dm_message_sync|dm_backfill|dm_send_execute
  status text not null default 'scheduled',
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  cursor_ref text,
  page_budget integer not null default 3,
  record_budget integer not null default 200,
  attempt_count integer not null default 0,
  max_attempts integer not null default 6,
  retry_budget_remaining integer not null default 6,
  requeue_count integer not null default 0,
  retry_after_ms integer,
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
create index if not exists meta_messaging_job_due_idx on public.meta_messaging_job (status, available_at);
create index if not exists meta_messaging_job_org_idx on public.meta_messaging_job (org_id, status);
create unique index if not exists meta_messaging_job_idem_uq on public.meta_messaging_job (org_id, idempotency_key) where idempotency_key <> '';
-- One active SYNC job per conversation+kind (send jobs are keyed by the send id via idempotency).
create unique index if not exists meta_messaging_job_active_uq
  on public.meta_messaging_job (org_id, conversation_id, job_kind)
  where status in ('scheduled','available','claimed','executing','retry_wait') and conversation_id is not null;

-- ── SKIP-LOCKED claim RPC (SECURITY DEFINER; per-org fair, bounded) ─────────
create or replace function public.meta_messaging_claim_due(
  p_now timestamptz, p_limit integer, p_per_org_max integer, p_lease_owner text, p_lease_seconds integer
) returns setof public.meta_messaging_job
language plpgsql security definer set search_path = public as $$
declare r public.meta_messaging_job;
begin
  for r in
    with due as (
      select j.*, row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc) as rn
      from public.meta_messaging_job j
      where j.status in ('scheduled','available','retry_wait')
        and j.available_at <= p_now
        and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    )
    select * from due where rn <= p_per_org_max order by priority asc, available_at asc limit p_limit
    for update skip locked
  loop
    update public.meta_messaging_job
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
  foreach t in array array['meta_dm_conversation','meta_dm_message','meta_dm_send','meta_messaging_job'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete: conversations, messages, sends and jobs
    -- are service-role writes only, after the server verifies capability + role +
    -- window + policy tag + approval. Outbound is NEVER auto-sent.
  end loop;
end $$;
