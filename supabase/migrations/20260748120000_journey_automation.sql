-- ============================================================================
-- ZONO — Phase 18: Journey Automation OS™.
-- ----------------------------------------------------------------------------
-- A deterministic ORCHESTRATION layer. It consumes the outputs of the existing
-- engines (Property Radar, Buyer Matching, Seller Intelligence, Exclusive
-- Acquisition, AI Copilot, Office Intelligence, Competitor Intelligence) and
-- coordinates tasks/reminders/briefs. It NEVER replaces their business logic.
--
-- Workflows are graph-based (nodes + edges), versioned (versions never deleted),
-- executed by a deterministic, idempotent, retry-safe, queue-backed executor.
-- Every action is audited. Additive + idempotent. RLS: org-scoped.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- A. journey_workflows — the live workflow (points at an active version) -------
create table if not exists public.journey_workflows (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null,
  description        text,
  journey_type       text not null default 'property',  -- seller/buyer/property/deal/lead/office
  status             text not null default 'draft',       -- draft/active/paused/archived
  trigger_type       text,                                -- denormalized primary trigger for fast dispatch
  active_version      int default 1,
  is_template_origin  boolean default false,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists jw_org_idx     on public.journey_workflows(org_id);
create index if not exists jw_dispatch_idx on public.journey_workflows(org_id, status, trigger_type);

-- B. journey_workflow_versions — immutable graph snapshots (never deleted) -----
create table if not exists public.journey_workflow_versions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  workflow_id  uuid not null references public.journey_workflows(id) on delete cascade,
  version      int not null,
  graph        jsonb not null default '{}'::jsonb,   -- { nodes:[], edges:[] }
  notes        text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz default now(),
  unique (workflow_id, version)
);
create index if not exists jwv_workflow_idx on public.journey_workflow_versions(workflow_id);

-- C. journey_triggers — trigger registrations (fast lookup on dispatch) --------
create table if not exists public.journey_triggers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  workflow_id  uuid not null references public.journey_workflows(id) on delete cascade,
  trigger_type text not null,
  config       jsonb not null default '{}'::jsonb,
  active       boolean default true,
  created_at   timestamptz default now()
);
create index if not exists jt_dispatch_idx on public.journey_triggers(org_id, trigger_type, active);

-- D. journey_executions — one run of a workflow version ------------------------
create table if not exists public.journey_executions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  workflow_id   uuid references public.journey_workflows(id) on delete set null,
  version       int not null default 1,
  status        text not null default 'running',  -- running/completed/failed/waiting/delayed/cancelled
  mode          text not null default 'execution', -- execution/simulation
  trigger_type  text,
  entity_type   text,
  entity_id     uuid,
  entity_label  text,
  context       jsonb not null default '{}'::jsonb,
  -- idempotency: at most one live execution per (workflow, entity, dedup_key)
  dedup_key     text,
  started_at    timestamptz default now(),
  finished_at   timestamptz,
  duration_ms   int,
  sla_due_at    timestamptz,
  sla_breached  boolean default false,
  steps_total   int default 0,
  steps_done    int default 0,
  error         text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (workflow_id, dedup_key)
);
create index if not exists je_org_status_idx on public.journey_executions(org_id, status);
create index if not exists je_entity_idx      on public.journey_executions(org_id, entity_type, entity_id);

-- E. journey_execution_steps — per-node execution record ----------------------
create table if not exists public.journey_execution_steps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  execution_id  uuid not null references public.journey_executions(id) on delete cascade,
  node_id       text not null,
  node_kind     text not null,   -- trigger/condition/delay/action/split/merge/end
  action_type   text,
  status        text not null default 'pending', -- pending/running/done/skipped/failed/waiting
  attempt       int default 0,
  max_attempts  int default 3,
  input         jsonb default '{}'::jsonb,
  output        jsonb default '{}'::jsonb,
  branch        text,
  scheduled_at  timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  error         text,
  created_at    timestamptz default now()
);
create index if not exists jes_exec_idx on public.journey_execution_steps(execution_id);

-- F. journey_templates — production-ready default journeys ---------------------
create table if not exists public.journey_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete cascade, -- null = global/system
  key          text not null,
  name         text not null,
  description  text,
  journey_type text not null default 'property',
  graph        jsonb not null default '{}'::jsonb,
  is_system    boolean default false,
  created_at   timestamptz default now()
);
create index if not exists jtpl_org_idx on public.journey_templates(org_id);

-- G. journey_delayed_actions — the durable delay/wait queue --------------------
create table if not exists public.journey_delayed_actions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  execution_id  uuid not null references public.journey_executions(id) on delete cascade,
  step_id       uuid references public.journey_execution_steps(id) on delete cascade,
  node_id       text not null,
  run_at        timestamptz not null,
  status        text not null default 'pending', -- pending/claimed/done/cancelled
  claimed_at    timestamptz,
  attempts      int default 0,
  payload       jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);
create index if not exists jda_due_idx on public.journey_delayed_actions(status, run_at);

-- H. journey_sla_rules — per-trigger SLA targets -------------------------------
create table if not exists public.journey_sla_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  applies_to       text not null default 'private_property', -- trigger/journey scope key
  minutes         int not null default 30,
  on_breach        jsonb not null default '[]'::jsonb,  -- [{action_type,...}]
  active           boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists jsla_org_idx on public.journey_sla_rules(org_id, active);

-- I. journey_audit_log — every action, who/when/why ----------------------------
create table if not exists public.journey_audit_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  execution_id  uuid references public.journey_executions(id) on delete set null,
  workflow_id   uuid references public.journey_workflows(id) on delete set null,
  node_id       text,
  event_type    text not null,  -- trigger_fired/step_started/step_done/step_failed/sla_breached/cancelled/simulated/...
  actor          text default 'system', -- system / user:<id>
  reason         text,
  detail        jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);
create index if not exists jal_exec_idx on public.journey_audit_log(execution_id);
create index if not exists jal_org_idx   on public.journey_audit_log(org_id, created_at desc);

-- updated_at triggers
drop trigger if exists trg_journey_workflows_updated on public.journey_workflows;
create trigger trg_journey_workflows_updated before update on public.journey_workflows for each row execute function public.set_updated_at();
drop trigger if exists trg_journey_executions_updated on public.journey_executions;
create trigger trg_journey_executions_updated before update on public.journey_executions for each row execute function public.set_updated_at();
drop trigger if exists trg_journey_sla_rules_updated on public.journey_sla_rules;
create trigger trg_journey_sla_rules_updated before update on public.journey_sla_rules for each row execute function public.set_updated_at();

-- RLS — org-scoped read for members; manager+ may author/manage; service role runs executions.
do $$
declare t text;
begin
  foreach t in array array[
    'journey_workflows','journey_workflow_versions','journey_triggers','journey_executions',
    'journey_execution_steps','journey_templates','journey_delayed_actions','journey_sla_rules','journey_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    -- journey_templates exposes system rows (org_id is null) to everyone authenticated.
    if t = 'journey_templates' then
      execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id is null or org_id = public.current_org_id());$f$, t);
    else
      execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    end if;
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager')) with check (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
