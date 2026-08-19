-- ============================================================================
-- ZONO — Marketing Autopilot 2.0 · STATEFUL weekly plan (ONE table).
-- Once a human edits + approves the deterministic weekly marketing plan we need a
-- stable, auditable snapshot to execute from. This is that snapshot — NOT one
-- table per action, NOT a second campaign/creative/matching store. `plan_json`
-- holds the full prepared+approved plan (items carry stable itemIds + per-item
-- execution results). Everything downstream (Distribution posts, buyer sends,
-- follow-up tasks) still lives in its canonical engine; this row only orchestrates.
-- Org-scoped + RLS. One ACTIVE (non-terminal) plan per property is enforced by a
-- partial unique index so "prepare" reuses the open draft instead of duplicating.
-- ============================================================================

create table if not exists public.marketing_plans (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,
  created_by     uuid references public.users(id) on delete set null,
  approved_by    uuid references public.users(id) on delete set null,
  status         text not null default 'draft'
                   check (status in ('draft','approved','activating','active','partially_completed','completed','cancelled','failed')),
  source_version text not null default 'autopilot-2.0',
  plan_json      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  approved_at    timestamptz,
  activated_at   timestamptz
);

create index if not exists idx_marketing_plans_org_property
  on public.marketing_plans (org_id, property_id);
create index if not exists idx_marketing_plans_org_status
  on public.marketing_plans (org_id, status);

-- At most ONE non-terminal (open) plan per property, so "הכן תוכנית" reuses the
-- existing draft/active plan rather than creating a duplicate. Terminal states
-- (completed / cancelled / failed) are excluded so history accumulates freely.
create unique index if not exists uq_marketing_plans_open_per_property
  on public.marketing_plans (org_id, property_id)
  where status in ('draft','approved','activating','active','partially_completed');

alter table public.marketing_plans enable row level security;

create policy marketing_plans_select on public.marketing_plans
  for select to authenticated
  using (org_id = public.current_org_id());

create policy marketing_plans_write on public.marketing_plans
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id() and public.has_min_role('agent'));

create trigger trg_marketing_plans_updated_at
  before update on public.marketing_plans
  for each row execute function public.set_updated_at();
