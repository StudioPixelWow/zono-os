-- ============================================================================
-- ZONO — Persistent Workflow Execution™ (Phase 30.4.1). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Persists AI Workflow Builder instances so workflows survive refresh/deploy.
-- ENTITY-AGNOSTIC (entity_type/entity_id can reference any business entity).
-- NOTHING executes automatically — status gates every workflow/step, and an
-- approved action step only creates a mission/draft (which are THEMSELVES
-- approval-gated). No changes to existing tables or protected-engine schema.
-- ============================================================================

create table if not exists public.zono_workflows (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid,
  template_id      text not null,
  name             text not null,
  entity_type      text not null,
  entity_id        text,
  entity_name      text,
  trigger          text not null,
  status           text not null default 'draft',   -- draft|running|waiting_approval|blocked|completed|cancelled
  progress         jsonb not null default '{}'::jsonb,
  explain          jsonb not null default '{}'::jsonb,
  context          jsonb not null default '{}'::jsonb,
  version          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid
);
create index if not exists zw_org_idx     on public.zono_workflows (organization_id, status);
create index if not exists zw_entity_idx  on public.zono_workflows (entity_type, entity_id);
create index if not exists zw_status_idx  on public.zono_workflows (status);
create index if not exists zw_updated_idx on public.zono_workflows (updated_at desc);

create table if not exists public.zono_workflow_steps (
  id                uuid primary key default gen_random_uuid(),
  workflow_id       uuid not null references public.zono_workflows(id) on delete cascade,
  step_key          text not null,                  -- template-relative step id (s1..sN)
  step_order        integer not null default 0,
  title             text not null,
  kind              text not null,                  -- condition|action|wait
  action            text,                           -- CREATE_MISSION|CREATE_DRAFT|CREATE_TASK|REQUEST_APPROVAL|NOTIFY_USER|SCHEDULE_FOLLOWUP
  mission_type      text,
  requires_approval boolean not null default false,
  status            text not null default 'pending',
  why               text,
  blocked_reason    text,
  outcome           text,
  created_mission_id uuid,
  updated_at        timestamptz not null default now(),
  unique (workflow_id, step_key)
);
create index if not exists zws_wf_idx on public.zono_workflow_steps (workflow_id, step_order);

create table if not exists public.zono_workflow_history (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.zono_workflows(id) on delete cascade,
  at           timestamptz not null default now(),
  step_key     text,
  event        text not null,                       -- created|approved|rejected|completed|blocked|cancelled|executed
  note         text
);
create index if not exists zwh_wf_idx on public.zono_workflow_history (workflow_id, at desc);

alter table public.zono_workflows       enable row level security;
alter table public.zono_workflow_steps  enable row level security;
alter table public.zono_workflow_history enable row level security;

-- Org members read their org's workflows (zono owner sees all). All writes go
-- through the service-role layer (bypasses RLS).
drop policy if exists zw_select on public.zono_workflows;
create policy zw_select on public.zono_workflows for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

drop policy if exists zws_select on public.zono_workflow_steps;
create policy zws_select on public.zono_workflow_steps for select to authenticated
  using (exists (select 1 from public.zono_workflows w where w.id = workflow_id
    and (public.is_zono_owner() or w.organization_id = public.current_org_id())));

drop policy if exists zwh_select on public.zono_workflow_history;
create policy zwh_select on public.zono_workflow_history for select to authenticated
  using (exists (select 1 from public.zono_workflows w where w.id = workflow_id
    and (public.is_zono_owner() or w.organization_id = public.current_org_id())));

grant select on public.zono_workflows        to authenticated;
grant select on public.zono_workflow_steps    to authenticated;
grant select on public.zono_workflow_history  to authenticated;
grant all    on public.zono_workflows         to service_role;
grant all    on public.zono_workflow_steps    to service_role;
grant all    on public.zono_workflow_history  to service_role;
