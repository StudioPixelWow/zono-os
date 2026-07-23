-- ============================================================================
-- 💳 ZONO OS 2.0 — STAGE 6 · Batch 6.4 · COMMERCIAL & ONBOARDING OS.
--
-- Purely ADDITIVE. Three new tables for the self-service commercial funnel:
--   · registration_drafts — resumable, expirable wizard state (NO password ever
--     stored here; the Supabase auth identity holds the credential).
--   · payments — Grow payment records with server-side VERIFICATION + replay
--     protection (unique provider txn). Writes are service-role only (webhook).
--   · subscriptions — the commercial lifecycle status per org.
-- The plan/entitlement/limits record (org_plans) + first-login checklist
-- (onboarding_progress) already exist (Phase 21) and are REUSED, not duplicated.
-- No existing table is altered.
-- ============================================================================

-- ── Registration drafts ─────────────────────────────────────────────────────
-- Pre-auth wizard state. Accessed ONLY via service-role server actions keyed by
-- an unguessable capability `token` (kept in an httpOnly cookie). RLS is enabled
-- with NO anon/authenticated policy → the anon/auth roles can never read a draft.
create table if not exists public.registration_drafts (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,               -- capability token (cookie)
  email         citext,
  auth_user_id  uuid,                                -- the created Supabase auth identity (no org yet)
  org_id        uuid references public.organizations(id) on delete set null,  -- set only after provisioning
  status        text not null default 'draft'
                  check (status in ('draft','submitted','paid','expired','abandoned')),
  current_step  int not null default 1,
  plan_tier     text,
  data          jsonb not null default '{}'::jsonb,  -- company/office/plan/integrations — NEVER the password
  expires_at    timestamptz not null default (now() + interval '7 days'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_registration_drafts_token on public.registration_drafts (token);
create index if not exists idx_registration_drafts_expires on public.registration_drafts (expires_at);
alter table public.registration_drafts enable row level security;
-- (intentionally no policies — service-role only)

-- ── Payments ────────────────────────────────────────────────────────────────
-- One row per payment attempt. `verified` flips to true ONLY inside the signed
-- Grow webhook after HMAC verification. Activation reads THIS flag, never a
-- browser redirect. Unique provider txn id = idempotency + replay protection.
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  draft_id       uuid references public.registration_drafts(id) on delete set null,
  org_id         uuid references public.organizations(id) on delete set null,
  provider       text not null default 'grow',
  provider_txn_id text,
  plan_tier      text not null,
  amount_ils     numeric(10,2) not null default 0,
  currency       text not null default 'ILS',
  status         text not null default 'pending'
                   check (status in ('pending','processing','paid','failed','cancelled','expired')),
  verified       boolean not null default false,     -- true ONLY after server-side signature verification
  verified_at    timestamptz,
  signature      text,
  raw_payload    jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint uq_payments_provider_txn unique (provider, provider_txn_id)
);
create index if not exists idx_payments_org on public.payments (org_id);
create index if not exists idx_payments_draft on public.payments (draft_id);
alter table public.payments enable row level security;
-- Self-service read for the org's managers (invoices / payment history). No
-- INSERT/UPDATE policy: only the service-role webhook writes payment state.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (org_id = public.current_org_id() and public.has_min_role('manager'));

-- ── Subscriptions ───────────────────────────────────────────────────────────
-- The commercial lifecycle per org. Written by the service-role provisioning +
-- self-service actions (owner-gated in code); readable by org members.
create table if not exists public.subscriptions (
  org_id                uuid primary key references public.organizations(id) on delete cascade,
  plan_tier             text not null default 'starter',
  status                text not null default 'trial'
                          check (status in ('trial','pending_payment','active','suspended','cancelled','expired','grace_period')),
  period_start          timestamptz,
  period_end            timestamptz,
  trial_ends_at         timestamptz,
  grace_until           timestamptz,
  grow_subscription_id  text,
  cancel_at_period_end  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (org_id = public.current_org_id());
-- (no write policy — service-role only)
