-- ============================================================================
-- ZONO — Persistent Agent Operations™ (Phase 29.2). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Persists the Autonomous AI Agent Framework so agents survive deploys, inbox
-- recommendations persist, approvals/rejections are tracked, and approved
-- recommendations can create missions/tasks. NOTHING auto-executes — every inbox
-- item is 'pending' until a human approves/rejects. Justified: durable agent
-- state (enabled flag, runs, inbox, memory, performance) is not modelled by any
-- existing table. No changes to protected engines.
-- ============================================================================

-- Enabled/disabled state + timings, per org + agent.
create table if not exists public.zono_agents (
  organization_id  uuid not null,
  agent_id         text not null,
  agent_type       text,
  name             text,
  enabled          boolean not null default true,
  schedule_mode    text,
  last_run_at      timestamptz,
  next_run_at      timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, agent_id)
);
create index if not exists za_org_idx on public.zono_agents (organization_id);

-- One row per agent run.
create table if not exists public.zono_agent_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         text not null,
  ran_at           timestamptz not null default now(),
  proposals        integer not null default 0,
  blocked          integer not null default 0,
  skipped          boolean not null default false,
  skip_reason      text,
  trigger          text not null default 'manual'
);
create index if not exists zar_org_agent_idx on public.zono_agent_runs (organization_id, agent_id, ran_at desc);

-- Persistent inbox — survives refresh/deploy. Dedup on (org, dedupe_key).
create table if not exists public.zono_agent_inbox (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  dedupe_key        text not null,
  agent_id          text not null,
  agent_name        text,
  kind              text not null,          -- recommendation | mission | task | draft
  entity            text,
  recommendation    text not null,
  reason            text,
  evidence          jsonb not null default '[]'::jsonb,
  confidence        integer not null default 0,
  impact            text not null default 'medium',
  urgency           integer not null default 0,
  mission_type      text,
  entity_type       text,
  entity_id         text,
  entity_name       text,
  requires_approval boolean not null default true,
  status            text not null default 'pending',  -- pending | approved | rejected | completed
  blocked           boolean not null default false,
  block_reason      text,
  explain           jsonb not null default '{}'::jsonb,
  created_mission_id uuid,
  decision_reason   text,
  decided_at        timestamptz,
  decided_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);
create index if not exists zai_org_status_idx on public.zono_agent_inbox (organization_id, status, urgency desc);
create index if not exists zai_agent_idx on public.zono_agent_inbox (organization_id, agent_id);

-- Organizational memory log (not LLM memory).
create table if not exists public.zono_agent_memory (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         text not null,
  kind             text not null,          -- recommended | approved | rejected | completed | failed | ignored
  detail           text,
  at               timestamptz not null default now()
);
create index if not exists zam_org_agent_idx on public.zono_agent_memory (organization_id, agent_id, at desc);

-- Performance snapshots over time.
create table if not exists public.zono_agent_performance (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         text not null,
  captured_at      timestamptz not null default now(),
  recommendations  integer not null default 0,
  approved         integer not null default 0,
  rejected         integer not null default 0,
  completed        integer not null default 0,
  failed           integer not null default 0,
  ignored          integer not null default 0,
  success_rate     integer not null default 0,
  avg_impact       integer not null default 0,
  false_positives  integer not null default 0
);
create index if not exists zap_org_agent_idx on public.zono_agent_performance (organization_id, agent_id, captured_at desc);

-- RLS: org members read their org's rows (zono owner sees all); writes via service_role.
do $$
declare t text;
begin
  foreach t in array array['zono_agents','zono_agent_runs','zono_agent_inbox','zono_agent_memory','zono_agent_performance'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_zono_owner() or organization_id = public.current_org_id());', t, t);
    execute format('grant select on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end $$;
