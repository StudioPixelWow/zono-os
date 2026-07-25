-- ============================================================================
-- 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 5 · Social Listening.
-- ----------------------------------------------------------------------------
-- Additive, idempotent. Provider-isolated listening for Meta-SUPPORTED mentions +
-- tagged content only (no open-web scraping). Sources are derived from ALREADY-
-- connected assets (an arbitrary external account can never be configured).
-- Mentions are canonical + provider-neutral; NOTHING here stores a token, raw
-- Graph payload, webhook signature, provider request/response body, raw cursor
-- text, or scraped profile data. A durable listening job queue reuses the Batch-6.8
-- lease / retry / SKIP-LOCKED conventions. No destructive change; no rewrite of
-- Phase 1–4 data.
-- ============================================================================

-- ── Listening sources (derived from connected assets ONLY) ───────────────────
create table if not exists public.meta_listening_source (
  id uuid primary key,
  org_id uuid not null,
  platform text not null,                      -- facebook | instagram
  source_kind text not null,                   -- page_mentions | account_mentions | tagged_media
  asset_id uuid not null,                       -- a connected meta_page / meta_instagram_account (trusted)
  asset_external_id text,                       -- convenience mirror (trusted, from the asset)
  config jsonb not null default '{}'::jsonb,    -- provider-neutral source config (no arbitrary target)
  enabled boolean not null default false,
  capability_state text not null default 'unknown',   -- allowed | blocked_capability | blocked_token | unsupported | unknown
  safe_block_reason text,
  cursor_ref text,                              -- provider-isolated cursor reference (opaque, safe)
  backfill_state text not null default 'idle',  -- idle | running | done | paused
  backfill_oldest_iso timestamptz,              -- backfill window floor (bounded)
  last_polled_at timestamptz,
  next_poll_at timestamptz,
  last_sync_status text not null default 'never',    -- ok | degraded | blocked | error | never
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meta_listening_source_due_idx on public.meta_listening_source (enabled, next_poll_at);
create index if not exists meta_listening_source_org_idx on public.meta_listening_source (org_id, platform);
-- One source per (org, asset, source_kind) — no duplicate monitors for a surface.
create unique index if not exists meta_listening_source_uq on public.meta_listening_source (org_id, asset_id, source_kind);

-- ── Canonical mentions (provider-neutral; dedup by org+platform+external id) ──
create table if not exists public.meta_mention (
  id uuid primary key,
  org_id uuid not null,
  listening_source_id uuid not null,
  platform text not null,
  external_mention_id text not null,
  mention_kind text not null default 'unknown_supported',
  source_object_ref text,                       -- provider-neutral ref to the object the mention lives on
  author_external_id text,
  author_display_safe text,
  message_text text,                            -- canonical PUBLIC content only (no raw payload)
  attachments_safe jsonb not null default '[]'::jsonb,   -- safe attachment metadata (kind/url-flag only)
  permalink_safe text,                          -- canonical permalink only when supported + safe
  provider_created_at timestamptz,
  ingested_at timestamptz not null default now(),
  edited_at timestamptz,
  content_fingerprint text not null,            -- dedup / edit detection
  status text not null default 'new',           -- new | reviewed | actionable | ignored | resolved | unavailable
  match_state text not null default 'unmatched',-- asset | provider_object | canonical_mapping | parent_child | unmatched
  matched_asset_id uuid,
  matched_provider_object_id uuid,
  inbox_conversation_id uuid,                    -- inbox projection reference (Phase-3), when actionable
  intelligence_signal_ref text,                  -- reference to Phase-4 derived signal (never AI text)
  unavailable boolean not null default false,    -- deleted/unavailable at provider
  evidence_kind text not null default 'provider_webhook',  -- provider-neutral evidence kind
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Dedup lookup (org + platform + external mention id) — a replay never duplicates.
create unique index if not exists meta_mention_dedup_uq on public.meta_mention (org_id, platform, external_mention_id);
-- Feed query (org + status + recency) and source/ match indexes.
create index if not exists meta_mention_feed_idx on public.meta_mention (org_id, status, provider_created_at desc);
create index if not exists meta_mention_source_idx on public.meta_mention (org_id, listening_source_id, provider_created_at desc);
create index if not exists meta_mention_match_idx on public.meta_mention (org_id, match_state);

-- ── Durable listening job queue (reuses Batch-6.8 conventions) ───────────────
create table if not exists public.meta_listening_job (
  id uuid primary key,
  org_id uuid not null,
  listening_source_id uuid not null,
  job_kind text not null default 'listening_poll',   -- listening_backfill|listening_poll|listening_webhook_followup|listening_gap_fill|listening_reconcile
  status text not null default 'scheduled',
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  cursor_ref text,                                    -- the cursor this job continues from (opaque)
  page_budget integer not null default 3,             -- max pages this execution
  record_budget integer not null default 200,         -- max records this execution
  attempt_count integer not null default 0,
  max_attempts integer not null default 6,
  retry_budget_remaining integer not null default 6,
  requeue_count integer not null default 0,
  retry_after_ms integer,                             -- provider Retry-After honored on next attempt
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
create index if not exists meta_listening_job_due_idx on public.meta_listening_job (status, available_at);
create index if not exists meta_listening_job_org_idx on public.meta_listening_job (org_id, status);
create unique index if not exists meta_listening_job_idem_uq on public.meta_listening_job (org_id, idempotency_key) where idempotency_key <> '';
-- One active job per (source, job_kind) — a burst of triggers coalesces.
create unique index if not exists meta_listening_job_active_uq
  on public.meta_listening_job (org_id, listening_source_id, job_kind)
  where status in ('scheduled','available','claimed','executing','retry_wait');

-- ── SKIP-LOCKED claim RPC (SECURITY DEFINER; per-org fair, bounded) ─────────
create or replace function public.meta_listening_claim_due(
  p_now timestamptz, p_limit integer, p_per_org_max integer, p_lease_owner text, p_lease_seconds integer
) returns setof public.meta_listening_job
language plpgsql security definer set search_path = public as $$
declare r public.meta_listening_job;
begin
  for r in
    with due as (
      select j.*, row_number() over (partition by j.org_id order by j.priority asc, j.available_at asc) as rn
      from public.meta_listening_job j
      where j.status in ('scheduled','available','retry_wait')
        and j.available_at <= p_now
        and (j.lease_expires_at is null or j.lease_expires_at <= p_now)
    )
    select * from due where rn <= p_per_org_max order by priority asc, available_at asc limit p_limit
    for update skip locked
  loop
    update public.meta_listening_job
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
-- Unmatched mentions are STILL tied to a trusted asset/org (org is derived from the
-- trusted asset→org mapping, never from a webhook payload or author/free text).
do $$
declare t text;
begin
  foreach t in array array['meta_listening_source','meta_mention','meta_listening_job'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- No authenticated insert/update/delete: sources, mentions and jobs are
    -- service-role writes only, after the server verifies capability + role +
    -- token health + provider support. Listening is READ-ONLY at the provider.
  end loop;
end $$;
