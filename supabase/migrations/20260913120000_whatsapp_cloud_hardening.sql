-- ============================================================================
-- 💬 ZONO — WhatsApp Cloud API hardening (48.1). Additive, idempotent.
-- Adds the Meta account identifiers needed for MULTI-TENANT routing
-- (phone_number_id → organization) + webhook health tracking. No new table:
-- approved templates are stored in the existing whatsapp_accounts.metadata jsonb.
-- ============================================================================
alter table public.whatsapp_accounts
  add column if not exists phone_number_id       text,
  add column if not exists waba_id               text,
  add column if not exists business_account_id   text,
  add column if not exists display_phone_number  text,
  add column if not exists last_webhook_at       timestamptz;

-- Routing index: resolve the org from an incoming webhook's phone_number_id fast.
create unique index if not exists whatsapp_accounts_phone_number_id_uidx
  on public.whatsapp_accounts (phone_number_id)
  where phone_number_id is not null;
