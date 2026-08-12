-- ============================================================================
-- ZONO — P5.7 Platform Support Center (ADDITIVE, platform-internal).
-- ----------------------------------------------------------------------------
-- Two NEW tables for the owner/operator support control plane. INTERNAL to the
-- platform: like platform_operators, RLS is ENABLED with NO authenticated
-- policies and grants are revoked from anon/authenticated, so the customer app
-- can NEVER read/enumerate support tickets or internal notes. Only the
-- service-role platform DAL (src/lib/platform-admin/server/support.ts) accesses
-- them. Does NOT touch any tenant table, org role, existing RLS, or the
-- existing support_impersonation_log (that is P5.8).
--
-- ROLLBACK:
--   drop table if exists public.support_ticket_notes;
--   drop table if exists public.support_tickets;
-- ============================================================================

-- ── support_tickets ─────────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  user_id               uuid references auth.users(id) on delete set null,   -- affected customer user (optional)
  subject               text not null,
  description           text,
  status                text not null default 'open'
                          check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  priority              text not null default 'normal'
                          check (priority in ('low','normal','high','urgent')),
  category              text not null default 'general',
  source                text not null default 'manual_platform'
                          check (source in ('manual_platform','customer_report','email','whatsapp','system_alert')),
  assigned_operator_id  uuid references public.platform_operators(user_id) on delete set null,
  -- SAFE operational linkage only: a short identifier/summary (e.g. "dead_letter:meta_publish"),
  -- NEVER a raw provider payload, token, or secret.
  linked_ref            text,
  created_by            uuid references auth.users(id) on delete set null,   -- operator who opened the ticket
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  closed_at             timestamptz
);
comment on table public.support_tickets is
  'ZONO platform support tickets (Owner Control Plane, P5.7). INTERNAL — RLS enabled, no authenticated policies; only the service-role platform DAL reads/writes. Every ticket is explicitly org-bound. No customer-facing exposure in P5.7.';

create index if not exists support_tickets_org_status_idx      on public.support_tickets (org_id, status);
create index if not exists support_tickets_status_priority_idx on public.support_tickets (status, priority);
create index if not exists support_tickets_assignee_idx        on public.support_tickets (assigned_operator_id);
create index if not exists support_tickets_created_idx         on public.support_tickets (created_at desc);

alter table public.support_tickets enable row level security;
-- No authenticated/anon policies → customers cannot read or enumerate tickets.
revoke all on public.support_tickets from anon;
revoke all on public.support_tickets from authenticated;

-- ── support_ticket_notes ────────────────────────────────────────────────────
create table if not exists public.support_ticket_notes (
  id                    uuid primary key default gen_random_uuid(),
  ticket_id             uuid not null references public.support_tickets(id) on delete cascade,
  author_operator_id    uuid references public.platform_operators(user_id) on delete set null,
  note                  text not null,
  -- INTERNAL-ONLY by default. A customer-visible support thread is a deliberate
  -- FUTURE design; until then every note is operator-internal.
  internal_only         boolean not null default true,
  created_at            timestamptz not null default now()
);
comment on table public.support_ticket_notes is
  'Internal operator notes on support tickets (P5.7). Isolated from customer-facing CRM notes (public.notes) so internal support notes are never exposed to the customer app. RLS enabled, no authenticated policies; service-role platform DAL only.';

create index if not exists support_ticket_notes_ticket_idx on public.support_ticket_notes (ticket_id, created_at desc);

alter table public.support_ticket_notes enable row level security;
revoke all on public.support_ticket_notes from anon;
revoke all on public.support_ticket_notes from authenticated;
