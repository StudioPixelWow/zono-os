-- ============================================================================
-- 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS. Additive migration ONLY.
--
-- Reuses the EXISTING canonical model verbatim: the per-org WhatsApp OAuth token
-- lives in distribution_provider_connections (provider='whatsapp', encrypted),
-- WABA/phone metadata + webhook health live in whatsapp_accounts, and the
-- conversation/message model stays whatsapp_conversations / whatsapp_messages.
-- Nothing there is duplicated. This migration adds only two things that did not
-- exist:
--   1. whatsapp_webhook_receipts — a hard unique idempotency ledger for
--      exactly-once webhook processing (the existing dedup is a best-effort
--      query; this makes it atomic and replay-proof).
--   2. notification_deliveries — tracks each external notification send
--      (WhatsApp today; email/push/sms later) with a unique dedup key so a
--      notification is delivered over a channel at most once.
-- ============================================================================

-- ── Part 3 — exactly-once webhook receipts ──────────────────────────────────
create table if not exists public.whatsapp_webhook_receipts (
  id                uuid primary key default gen_random_uuid(),
  phone_number_id   text,
  event_id          text not null,             -- wa message id or status:<id>:<status>
  event_kind        text not null,             -- 'message' | 'status'
  received_at       timestamptz not null default now(),
  -- Process each (phone_number_id, event_id) exactly once.
  constraint uq_whatsapp_webhook_receipt unique (phone_number_id, event_id)
);
-- Service-role only (RLS on, no policy) — receipts are never read by a browser.
alter table public.whatsapp_webhook_receipts enable row level security;

create index if not exists idx_whatsapp_webhook_receipts_received
  on public.whatsapp_webhook_receipts (received_at);

-- ── Part 6 — notification delivery tracking (provider layer) ────────────────
create table if not exists public.notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null,
  user_id              uuid,
  notification_id      uuid,                    -- references the in-app notifications row when present
  channel              text not null,           -- 'whatsapp' | 'email' | 'push' | 'sms'
  provider             text,                    -- e.g. 'whatsapp_cloud'
  status               text not null default 'queued'
                         check (status in ('queued','sent','delivered','read','failed','skipped')),
  provider_message_id  text,
  dedup_key            text not null,           -- idempotency: one delivery per (notification, channel, target)
  error                text,
  payload              jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_notification_delivery unique (org_id, dedup_key)
);

alter table public.notification_deliveries enable row level security;

-- Read: same org AND (own delivery OR manager). Writes are service-role only.
create policy notification_deliveries_select on public.notification_deliveries
  for select using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.has_min_role('manager'))
  );

create index if not exists idx_notification_deliveries_org on public.notification_deliveries (org_id, created_at);
