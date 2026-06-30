-- ============================================================================
-- ZONO — National Brokerage Discovery Engine™ (Phase 26.10). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Builds the real brokerage-office graph from EVIDENCE only. No office is ever
-- fabricated. This migration adds:
--   1) broker resolution provenance columns on brokerage_agents (additive),
--   2) brokerage_office_evidence — one row per persisted evidence item (every
--      claim cites its source, provider, confidence, reason, supporting sources),
--   3) brokerage_office_discovery_runs — one row per discovery pass with the full
--      breakdown (offices created, brokers resolved/pending/unresolved, AI use).
-- Reuses the existing RLS helpers (is_zono_owner / brokerage_city_visible).
-- Does NOT modify existing listing→broker links or the ownership model.
-- ============================================================================

-- ── 1) Broker resolution provenance (additive columns) ──────────────────────
alter table public.brokerage_agents
  add column if not exists resolution_method      text,             -- existing_office_match | shared_phone_cluster | shared_contact | ai_reasoning | manual | null
  add column if not exists resolution_confidence  numeric,          -- 0–100 confidence in the office assignment
  add column if not exists resolution_sources     jsonb not null default '[]'::jsonb,  -- ["observed_listing","shared_phone","openai_reasoning",...]
  add column if not exists resolution_explanation text,             -- human-readable Hebrew explanation
  add column if not exists resolved_at            timestamptz;

create index if not exists ba_resolution_method_idx on public.brokerage_agents (resolution_method);

-- ── 2) Evidence ledger ───────────────────────────────────────────────────────
-- Every evidence item the discovery engine considered, persisted with full
-- provenance. AI rows store the provider + the cited supporting sources.
create table if not exists public.brokerage_office_evidence (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.brokerage_agents(id) on delete cascade,
  office_id           uuid references public.brokerage_offices(id) on delete set null,
  tier                text not null,            -- observed_listing | shared_contact | public_web | ai_reasoning
  source              text not null,            -- e.g. shared_phone | external_listing | google_business | openai_reasoning
  provider            text,                     -- model id for ai_reasoning (e.g. gpt-5.5) — null otherwise
  confidence          numeric not null default 0,
  claim               text not null,            -- the conclusion (e.g. "Broker belongs to Remax Vision")
  reason              text,                     -- why
  supporting_sources  jsonb not null default '[]'::jsonb,  -- evidence ids / labels the claim relies on
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists boe_agent_idx  on public.brokerage_office_evidence (agent_id);
create index if not exists boe_office_idx  on public.brokerage_office_evidence (office_id);
create index if not exists boe_tier_idx    on public.brokerage_office_evidence (tier);
create index if not exists boe_created_idx on public.brokerage_office_evidence (created_at desc);

-- ── 3) Discovery runs ────────────────────────────────────────────────────────
create table if not exists public.brokerage_office_discovery_runs (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid references public.organizations(id) on delete set null,
  requested_by         uuid,
  status               text not null default 'running',  -- running | completed | partial | failed
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  brokers_detected     integer not null default 0,
  offices_created      integer not null default 0,
  offices_matched      integer not null default 0,
  brokers_resolved     integer not null default 0,
  brokers_pending      integer not null default 0,
  brokers_unresolved   integer not null default 0,
  evidence_persisted   integer not null default 0,
  ai_calls             integer not null default 0,
  ai_resolved          integer not null default 0,
  breakdown            jsonb not null default '{}'::jsonb,
  log                  jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists bodr_org_idx     on public.brokerage_office_discovery_runs (organization_id, created_at desc);
create index if not exists bodr_status_idx   on public.brokerage_office_discovery_runs (status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.brokerage_office_evidence       enable row level security;
alter table public.brokerage_office_discovery_runs enable row level security;

-- Evidence is visible to the ZONO owner, or to a city user when the broker's city
-- is in their allowed data cities (mirrors brokerage_agents visibility).
drop policy if exists boe_select on public.brokerage_office_evidence;
create policy boe_select on public.brokerage_office_evidence for select to authenticated
  using (
    public.is_zono_owner()
    or exists (select 1 from public.brokerage_agents a where a.id = agent_id and public.brokerage_city_visible(a.city))
  );

-- Discovery runs are an owner-level operational log.
drop policy if exists bodr_select on public.brokerage_office_discovery_runs;
create policy bodr_select on public.brokerage_office_discovery_runs for select to authenticated
  using (public.is_zono_owner());

grant select on public.brokerage_office_evidence, public.brokerage_office_discovery_runs to authenticated;
grant all on public.brokerage_office_evidence, public.brokerage_office_discovery_runs to service_role;
