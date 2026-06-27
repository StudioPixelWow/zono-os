-- ============================================================================
-- PHASE MAI-12 — Autonomous Growth Strategy™.
--
-- Turns the Market Acceptance Intelligence™ pipeline (MAI-6..11) into a
-- structured, evidence-backed EXECUTION strategy that helps a broker improve
-- Zone Dominance over time. It does NOT invent strategy: every action
-- originates from a measurable gap/opportunity already produced upstream and
-- carries its supporting evidence, expected measurable outcome, confidence, and
-- estimated Zone Dominance impact. The Zone Dominance projection is a clearly-
-- marked SIMULATION (estimate, never a guarantee). Deterministic, no LLM, no
-- free text, no fake values. Org-scoped + RLS read; service-role writes. No UI.
-- ============================================================================
create table if not exists public.broker_growth_strategy (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  broker_id             uuid not null references public.broker_profiles(id) on delete cascade,
  generated_at          timestamptz not null default now(),
  model_version         text not null default 'mai-12.0',
  strategy_version      text not null default 'v1',

  overall_priority      text,        -- HIGH | MEDIUM | LOW | NONE
  overall_confidence    numeric not null default 0,
  expected_zone_score   numeric,     -- SIMULATION — projected Zone Dominance
  expected_improvement  numeric,     -- SIMULATION — projected delta vs current

  -- ── Time-bucketed execution plan (structured actions) ─────────────────────
  daily_actions         jsonb not null default '[]'::jsonb,
  weekly_actions        jsonb not null default '[]'::jsonb,
  monthly_actions       jsonb not null default '[]'::jsonb,

  -- ── Cross-cuts ────────────────────────────────────────────────────────────
  quick_wins            jsonb not null default '[]'::jsonb,
  long_term_actions     jsonb not null default '[]'::jsonb,
  blocked_actions       jsonb not null default '[]'::jsonb,

  -- ── Simulation + traceability ─────────────────────────────────────────────
  estimated_impact      jsonb not null default '{}'::jsonb,   -- marked SIMULATION
  evidence              jsonb not null default '[]'::jsonb,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One current strategy per broker + strategy version (re-runs upsert).
create unique index if not exists bgs_broker_version_uidx
  on public.broker_growth_strategy (organization_id, broker_id, strategy_version);

create index if not exists bgs_org_idx          on public.broker_growth_strategy (organization_id);
create index if not exists bgs_org_priority_idx  on public.broker_growth_strategy (organization_id, overall_priority);
create index if not exists bgs_org_generated_idx on public.broker_growth_strategy (organization_id, generated_at);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.broker_growth_strategy enable row level security;

drop policy if exists bgs_select on public.broker_growth_strategy;
create policy bgs_select on public.broker_growth_strategy
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.broker_growth_strategy to authenticated;
