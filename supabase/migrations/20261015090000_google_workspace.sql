-- ============================================================================
-- 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS. Additive migration ONLY.
--
-- Six additive tables backing the canonical Google integration layer. Nothing
-- existing is altered. Per-user OAuth (google_connections), per-calendar sync
-- state + watch channels (google_calendar_sync), an event mapping table that
-- enforces duplicate-prevention + idempotent writes (google_synced_events),
-- webhook idempotency (google_webhook_receipts), and read-only staged contacts
-- that NEVER auto-merge into the CRM (google_contact_imports).
--
-- Security invariants encoded here:
--   · Tokens are stored ENCRYPTED only (access_token_encrypted / refresh_...),
--     written exclusively by the service role — there is NO write policy, and
--     the SELECT policies never expose token columns to a browser client that
--     lacks service role (RLS + column choice at the app layer).
--   · Cross-org isolation: every SELECT policy is gated on current_org_id().
--   · Per-user visibility: a user sees only their own connection; managers may
--     see org connection HEALTH (not another user's tokens — app layer never
--     selects token columns for the manager view).
--   · Replay/duplicate protection: unique (connection, calendar, event) and a
--     unique idempotency request_id per connection.
-- ============================================================================

-- ── Part 1 — per-user OAuth connection ──────────────────────────────────────
create table if not exists public.google_connections (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null,
  user_id                  uuid not null,               -- ZONO auth user (per-user OAuth)
  google_sub               text,                        -- Google account subject id
  email                    text,
  display_name             text,
  scopes                   text[] not null default '{}',
  access_token_encrypted   text,                        -- AES-256-GCM ciphertext ("v1:...")
  refresh_token_encrypted  text,                        -- AES-256-GCM ciphertext ("v1:...")
  token_expires_at         timestamptz,
  status                   text not null default 'disconnected'
                             check (status in ('connected','disconnected','expired','revoked','permission_missing','syncing')),
  last_sync_at             timestamptz,
  last_error               text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (org_id, user_id)                              -- one Google connection per user per org
);

alter table public.google_connections enable row level security;

-- Read: same org AND (own connection OR manager). Writes are service-role only
-- (NO insert/update/delete policy exists) so tokens can never be written or
-- rotated from a browser session.
create policy google_connections_select on public.google_connections
  for select using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.has_min_role('manager'))
  );

-- ── Part 2/6 — per-calendar sync state + watch channels ─────────────────────
create table if not exists public.google_calendar_sync (
  id                    uuid primary key default gen_random_uuid(),
  connection_id         uuid not null references public.google_connections(id) on delete cascade,
  org_id                uuid not null,
  google_calendar_id    text not null,
  selected              boolean not null default true,   -- user chose to sync this calendar
  summary               text,
  time_zone             text,
  sync_token            text,                             -- incremental sync cursor
  channel_id            text,                             -- push (watch) channel uuid
  channel_resource_id   text,                             -- Google resource id for the channel
  channel_expiration    timestamptz,
  last_sync_at          timestamptz,
  last_status           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (connection_id, google_calendar_id)
);

alter table public.google_calendar_sync enable row level security;

create policy google_calendar_sync_select on public.google_calendar_sync
  for select using (org_id = public.current_org_id());

-- ── Part 2/5/6 — event mapping: duplicate prevention + idempotent writes ────
create table if not exists public.google_synced_events (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.google_connections(id) on delete cascade,
  org_id              uuid not null,
  google_calendar_id  text not null,
  google_event_id     text not null,
  ical_uid            text,
  etag                text,
  request_id          text,                              -- idempotency key sent on create
  internal_ref        text,                              -- optional internal event id
  has_meet            boolean not null default false,
  status              text,
  google_updated_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One row per Google event → prevents duplicate imports.
  constraint uq_google_event unique (connection_id, google_calendar_id, google_event_id),
  -- One create per idempotency key → replay-safe writes (NULLs are distinct).
  constraint uq_google_request unique (connection_id, request_id)
);

alter table public.google_synced_events enable row level security;

create policy google_synced_events_select on public.google_synced_events
  for select using (org_id = public.current_org_id());

-- ── Part 6 — webhook (watch notification) idempotency ───────────────────────
create table if not exists public.google_webhook_receipts (
  id              uuid primary key default gen_random_uuid(),
  channel_id      text not null,
  resource_id     text not null,
  message_number  bigint,
  resource_state  text,
  received_at     timestamptz not null default now(),
  -- A Google push may retry with the same message number → process once.
  constraint uq_google_webhook unique (channel_id, message_number)
);

-- Service-role only (RLS on, NO policy) — webhook receipts are never read by a
-- browser session.
alter table public.google_webhook_receipts enable row level security;

-- ── Part 4 — read-only staged Google contacts (NEVER auto-merge) ────────────
create table if not exists public.google_contact_imports (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  user_id        uuid not null,
  connection_id  uuid not null references public.google_connections(id) on delete cascade,
  resource_name  text not null,                          -- People API resourceName
  display_name   text,
  emails         text[] not null default '{}',
  phones         text[] not null default '{}',
  organization   text,
  merged_into    text,                                   -- CRM ref set ONLY on explicit user merge
  merged_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (connection_id, resource_name)
);

alter table public.google_contact_imports enable row level security;

-- Read: same org AND (own import OR manager). Writes service-role only.
create policy google_contact_imports_select on public.google_contact_imports
  for select using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.has_min_role('manager'))
  );

-- Helpful indexes (all additive).
create index if not exists idx_google_connections_org on public.google_connections (org_id);
create index if not exists idx_google_calendar_sync_conn on public.google_calendar_sync (connection_id);
create index if not exists idx_google_synced_events_conn on public.google_synced_events (connection_id);
create index if not exists idx_google_contact_imports_conn on public.google_contact_imports (connection_id);
