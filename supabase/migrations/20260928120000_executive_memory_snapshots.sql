-- ============================================================================
-- 🧭 ZONO OS 2.0 — Batch 5.9 · EXECUTIVE MEMORY snapshots.
--
-- Immutable, append-only snapshots of the Executive Decision Engine's output,
-- per organization and audience. Executive Memory answers ONE question —
-- "what changed since the last executive review?" — by comparing snapshots.
-- It never recomputes priorities and never creates recommendations.
--
-- IMMUTABILITY: no UPDATE policy and no DELETE policy exist — under RLS the
-- rows cannot be modified or removed by any application role. Retention
-- (default 90 days) is enforced as a READ WINDOW in the service; physical
-- purging is a future admin task, deliberately not an application capability.
-- ============================================================================

create table if not exists public.executive_memory_snapshots (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  -- 'manager' snapshots may contain org-scope decisions (Data Quality /
  -- Coverage / Office); 'member' snapshots never do.
  audience   text not null check (audience in ('manager', 'member')),
  taken_at   timestamptz not null default now(),
  -- Snapshot entries reference CANONICAL identities (decision ids, upstream
  -- recommendation ids, journey ids, evidence ids) — facts are not duplicated
  -- beyond the fields needed for diffing (priority/confidence/category/action).
  decisions  jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists executive_memory_snapshots_org_aud_time_idx
  on public.executive_memory_snapshots (org_id, audience, taken_at desc);

alter table public.executive_memory_snapshots enable row level security;

-- SELECT: org-scoped; manager-audience snapshots are visible to managers only.
create policy executive_memory_snapshots_select
  on public.executive_memory_snapshots for select
  using (
    org_id = public.current_org_id()
    and (audience = 'member' or public.has_min_role('manager'))
  );

-- INSERT: org-scoped; any agent may append a member snapshot; only managers
-- may append a manager snapshot. No UPDATE / DELETE policies — immutable.
create policy executive_memory_snapshots_insert
  on public.executive_memory_snapshots for insert
  with check (
    org_id = public.current_org_id()
    and public.has_min_role('agent')
    and (audience = 'member' or public.has_min_role('manager'))
  );
