-- ============================================================================
-- ZONO — National Brokerage Research Engine™ (Phase 26.13b). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- A persisted research dossier per broker: the safe queries generated, the
-- structured evidence collected by real providers, per-provider status, the
-- possible offices that evidence suggests, the AI evidence summary, and the
-- exact missing evidence. Research DISCOVERS evidence; it never fabricates a
-- conclusion. Resolution remains the job of the Broker Identity Engine (26.12).
-- ============================================================================

create table if not exists public.brokerage_research_dossier (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references public.brokerage_agents(id) on delete cascade,
  broker_name        text,
  city               text,
  status             text not null default 'insufficient_evidence',  -- resolved | needs_review | insufficient_evidence | conflicting_evidence
  queries            jsonb not null default '[]'::jsonb,     -- safe search queries generated
  evidence           jsonb not null default '[]'::jsonb,     -- ResearchEvidence[] collected
  providers          jsonb not null default '[]'::jsonb,     -- per-provider status (configured / skipped)
  possible_offices   jsonb not null default '[]'::jsonb,     -- candidate office names + confidence + sources
  missing_evidence   jsonb not null default '[]'::jsonb,
  ai_summary         text,
  public_results     integer not null default 0,
  evidence_items     integer not null default 0,
  last_researched_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists brd_agent_idx  on public.brokerage_research_dossier (agent_id);
create index if not exists brd_status_idx        on public.brokerage_research_dossier (status);
create index if not exists brd_researched_idx     on public.brokerage_research_dossier (last_researched_at desc);

alter table public.brokerage_research_dossier enable row level security;

drop policy if exists brd_select on public.brokerage_research_dossier;
create policy brd_select on public.brokerage_research_dossier for select to authenticated
  using (
    public.is_zono_owner()
    or exists (select 1 from public.brokerage_agents a where a.id = agent_id and public.brokerage_city_visible(a.city))
  );

grant select on public.brokerage_research_dossier to authenticated;
grant all on public.brokerage_research_dossier to service_role;
