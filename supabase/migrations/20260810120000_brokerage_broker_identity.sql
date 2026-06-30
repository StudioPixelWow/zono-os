-- ============================================================================
-- ZONO — Broker Identity Resolution Engine™ (Phase 26.12). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- One explainable resolution row per broker: which office (if any), confidence,
-- the full evidence set, provider list, why it was chosen, why alternatives were
-- rejected, the AI reasoning, and — when unresolved — the exact missing evidence.
-- Per-source evidence rows continue to live in brokerage_office_evidence.
-- No office is ever created here; a broker's own name is never office evidence.
-- ============================================================================

create table if not exists public.brokerage_broker_identity (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references public.brokerage_agents(id) on delete cascade,
  resolved_office_id uuid references public.brokerage_offices(id) on delete set null,
  resolved_office_name text,                  -- observed/recommended name (never invented)
  status             text not null default 'insufficient_evidence',  -- resolved | needs_review | insufficient_evidence | conflicting_evidence
  confidence         numeric not null default 0,
  why                text,                    -- why the selected office won
  ai_reasoning       text,                    -- the model's evidence-only reasoning (or null)
  evidence           jsonb not null default '[]'::jsonb,   -- scored evidence items
  providers          jsonb not null default '[]'::jsonb,   -- public providers queried + status
  alternatives       jsonb not null default '[]'::jsonb,   -- rejected candidate offices + why
  missing_evidence   jsonb not null default '[]'::jsonb,   -- exact evidence still needed
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists bbi_agent_idx on public.brokerage_broker_identity (agent_id);
create index if not exists bbi_status_idx on public.brokerage_broker_identity (status);
create index if not exists bbi_office_idx on public.brokerage_broker_identity (resolved_office_id);

alter table public.brokerage_broker_identity enable row level security;

drop policy if exists bbi_select on public.brokerage_broker_identity;
create policy bbi_select on public.brokerage_broker_identity for select to authenticated
  using (
    public.is_zono_owner()
    or exists (select 1 from public.brokerage_agents a where a.id = agent_id and public.brokerage_city_visible(a.city))
  );

grant select on public.brokerage_broker_identity to authenticated;
grant all on public.brokerage_broker_identity to service_role;
