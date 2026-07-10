-- ============================================================================
-- ZONO — Per-user WhatsApp SESSION (temporary QR / WhatsApp-Web provider phase).
-- ----------------------------------------------------------------------------
-- Each broker connects THEIR OWN personal WhatsApp (scoped organization_id +
-- user_id). Sessions are never shared and never global. This reuses the existing
-- whatsapp_accounts table (no new inbox/schema) — we only add per-user scoping
-- and the fields the swappable provider needs (session ref + QR + granular state
-- in metadata). The QR/session provider is TEMPORARY and swappable for the
-- official Cloud API later without touching Inbox / AI / CRM / Timeline.
-- Session material lives server-side only and is never exposed to the client.
-- ============================================================================

-- 1) Per-session owner + provider kind + opaque session reference.
alter table public.whatsapp_accounts
  add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.whatsapp_accounts
  add column if not exists provider_kind text;         -- 'bridge' | 'cloud' | 'none'
alter table public.whatsapp_accounts
  add column if not exists session_ref text;           -- opaque handle to the bridge session
alter table public.whatsapp_accounts
  add column if not exists last_connected_at timestamptz;

-- 2) Replace the org-global uniqueness with a scope-aware scheme so the existing
--    org-scoped Cloud row (user_id NULL) and per-broker QR sessions coexist.
alter table public.whatsapp_accounts
  drop constraint if exists wa_accounts_uniq;

-- Org-scoped rows (user_id NULL) — one per (org, provider). Keeps the Cloud row.
create unique index if not exists uq_wa_accounts_org_provider_orgscope
  on public.whatsapp_accounts (organization_id, provider)
  where user_id is null;

-- User-scoped sessions — one per (org, provider, user).
create unique index if not exists uq_wa_accounts_org_provider_user
  on public.whatsapp_accounts (organization_id, provider, user_id)
  where user_id is not null;

create index if not exists idx_wa_accounts_user
  on public.whatsapp_accounts (user_id);
