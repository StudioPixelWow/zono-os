-- ============================================================================
-- ZONO — ZI Expert™ Diagnostics Engine (Phase 24)
-- ----------------------------------------------------------------------------
-- ZI diagnoses "why is this not working?" using a BOUNDED, non-sensitive signal
-- snapshot (system health, last sync, data coverage, permissions, env presence).
-- It is SUPPORT-ONLY: inspects + explains + suggests, never acts or mutates.
--
-- This table stores diagnostic RUNS for audit + the admin diagnostics view. It
-- contains ONLY redacted, non-sensitive fields: no secrets, no API keys, no raw
-- provider payloads, no cross-org data. Additive + idempotent.
-- ============================================================================

create table if not exists public.zi_diagnostic_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  correlation_id   text not null,                 -- safe id to reference in a support ticket
  issue_type       text not null,                 -- e.g. property_radar_empty / map_empty
  status           text not null check (status in ('healthy','warning','critical','unknown')),
  current_route    text,
  module           text,
  summary          text not null default '',
  likely_cause     text,
  role             text,                          -- caller role at diagnosis time (non-sensitive)
  findings         jsonb not null default '[]'::jsonb,   -- [{id,severity,title}] — titles only
  support_payload  jsonb not null default '{}'::jsonb,   -- redacted payload (no secrets / raw data)
  created_at       timestamptz not null default now()
);

create index if not exists zi_dx_org_idx on public.zi_diagnostic_runs(organization_id, created_at desc);
create index if not exists zi_dx_org_user_idx on public.zi_diagnostic_runs(organization_id, user_id, created_at desc);
create index if not exists zi_dx_issue_idx on public.zi_diagnostic_runs(organization_id, issue_type, created_at desc);

-- ── RLS — own rows for everyone; managers+ see all runs in their org ──────────
alter table public.zi_diagnostic_runs enable row level security;

drop policy if exists "zi_dx_select" on public.zi_diagnostic_runs;
create policy "zi_dx_select" on public.zi_diagnostic_runs
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (user_id = auth.uid() or public.has_min_role('manager'))
  );

drop policy if exists "zi_dx_insert" on public.zi_diagnostic_runs;
create policy "zi_dx_insert" on public.zi_diagnostic_runs
  for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());

-- ── grants ───────────────────────────────────────────────────────────────────
grant select, insert on public.zi_diagnostic_runs to authenticated;
grant all privileges on public.zi_diagnostic_runs to service_role;
