-- ============================================================================
-- ZONO — 0046 · Central Audit Log
-- ----------------------------------------------------------------------------
-- One immutable row per sensitive action (assignments, approvals, pricing/stage
-- changes, routing, permission/configuration changes, recomputes). Org-scoped,
-- readable by managers, written via the service role from the audit helper.
-- Idempotent.
-- ============================================================================

create table if not exists public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  actor_id         uuid references public.users(id) on delete set null,
  actor_name       text,
  action           text not null,
  category         text not null,
  entity_type      text,
  entity_id        uuid,
  summary          text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists audit_log_org_idx on public.audit_log(organization_id, created_at desc);
create index if not exists audit_log_category_idx on public.audit_log(organization_id, category, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(organization_id, actor_id);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'));

grant select on public.audit_log to authenticated;
grant all privileges on public.audit_log to service_role;
