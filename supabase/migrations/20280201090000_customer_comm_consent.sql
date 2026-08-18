-- ============================================================================
-- ZONO — External Customer Communication: CONSENT / opt-out model.
-- ----------------------------------------------------------------------------
-- The compliance foundation for messaging real customers (sellers/buyers/leads)
-- over WhatsApp/email. Conservative, law-aligned model:
--   • marketing messages require an explicit opted_in row
--   • transactional/service messages are allowed unless opted_out
--   • a global opt-out (from an unsubscribe link) is ALWAYS honored
-- One row per (org, contact, channel). Additive; no existing table changes.
-- The customer send-ledger reuses the existing `notification_deliveries` table
-- (idempotent per (org, dedup_key)) — no second ledger is introduced.
-- ============================================================================

create table if not exists public.customer_comm_consent (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  contact_type  text not null check (contact_type in ('buyer','seller','lead')),
  contact_id    uuid not null,
  channel       text not null check (channel in ('whatsapp','email')),
  status        text not null default 'unset' check (status in ('opted_in','opted_out','unset')),
  source        text,                 -- agent | unsubscribe_link | import | portal
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (org_id, contact_type, contact_id, channel)
);

create index if not exists idx_customer_comm_consent_lookup
  on public.customer_comm_consent (org_id, contact_type, contact_id);

alter table public.customer_comm_consent enable row level security;

-- Org members read their org's consent; agents+ manage it. Service role (cron,
-- unsubscribe link) bypasses RLS for background writes.
create policy customer_comm_consent_select on public.customer_comm_consent
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_comm_consent_write on public.customer_comm_consent
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id());
