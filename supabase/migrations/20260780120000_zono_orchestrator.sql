-- ============================================================================
-- ZONO — PHASE 26: Automation Orchestrator™
-- Central orchestration layer that connects external sync → market sources →
-- snapshots → decision brain → events → alerts → revalidation into one run.
-- Two infra tables: run ledger + per-org concurrency lock.
-- Additive + idempotent. Org column: organization_id. RLS via current_org_id();
-- service-role (cron) bypasses RLS.
-- ============================================================================

-- ── Run ledger ───────────────────────────────────────────────────────────────
create table if not exists public.zono_orchestrator_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  trigger         text not null,                       -- login|dashboard_load|manual_sync|scheduled_cron|property_created|property_updated|external_sync_completed|transactions_sync_completed
  source          text,
  status          text not null default 'running',     -- running|success|partial|failed|skipped
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_ms     integer,
  steps           jsonb not null default '[]'::jsonb,   -- [{ name, status, durationMs, summary, error? }]
  error           text,
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists zono_orch_runs_org_idx        on public.zono_orchestrator_runs(organization_id);
create index if not exists zono_orch_runs_recent_idx     on public.zono_orchestrator_runs(organization_id, started_at desc);
create index if not exists zono_orch_runs_org_status_idx on public.zono_orchestrator_runs(organization_id, status, finished_at desc);

-- ── Per-org concurrency lock ─────────────────────────────────────────────────
create table if not exists public.zono_orchestrator_locks (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  locked_at       timestamptz not null default now(),
  lock_token      text not null,
  expires_at      timestamptz not null,
  trigger         text,
  created_by      uuid references public.users(id) on delete set null
);

create index if not exists zono_orch_locks_expiry_idx on public.zono_orchestrator_locks(expires_at);

-- ── RLS — org isolation; reads for the org, writes for agents+ ───────────────
-- (The orchestrator itself writes via the service-role client, which bypasses
--  RLS; these policies govern any in-app reads/inspection.)
do $$
begin
  execute 'alter table public.zono_orchestrator_runs enable row level security;';
  execute 'drop policy if exists zono_orch_runs_select on public.zono_orchestrator_runs;';
  execute 'create policy zono_orch_runs_select on public.zono_orchestrator_runs for select to authenticated using (organization_id = public.current_org_id());';
  execute 'drop policy if exists zono_orch_runs_insert on public.zono_orchestrator_runs;';
  execute 'create policy zono_orch_runs_insert on public.zono_orchestrator_runs for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
  execute 'drop policy if exists zono_orch_runs_update on public.zono_orchestrator_runs;';
  execute 'create policy zono_orch_runs_update on public.zono_orchestrator_runs for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'alter table public.zono_orchestrator_locks enable row level security;';
  execute 'drop policy if exists zono_orch_locks_select on public.zono_orchestrator_locks;';
  execute 'create policy zono_orch_locks_select on public.zono_orchestrator_locks for select to authenticated using (organization_id = public.current_org_id());';
  execute 'drop policy if exists zono_orch_locks_all on public.zono_orchestrator_locks;';
  execute 'create policy zono_orch_locks_all on public.zono_orchestrator_locks for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
end $$;

grant select, insert, update, delete on public.zono_orchestrator_runs  to authenticated;
grant select, insert, update, delete on public.zono_orchestrator_locks to authenticated;
