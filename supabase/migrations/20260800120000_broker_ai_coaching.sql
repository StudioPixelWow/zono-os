-- ============================================================================
-- PHASE MAI-11 — Evidence-Based Broker Coach™.
--
-- The first coaching layer for ZONO. It is NOT a chatbot, NOT a generic LLM
-- assistant, and NOT free-form advice. Every recommendation is generated
-- deterministically from the Market Acceptance Intelligence™ pipeline
-- (MAI-6..10) and references the exact evidence that produced it. When evidence
-- is insufficient the coach returns "Not enough evidence" — it never
-- compensates with AI reasoning, never invents, never guesses.
--
-- One coaching record per (org, broker, coach_version). Structured output only
-- (recommendations / insights / warnings / opportunities / strengths), each
-- traceable to source data. Org-scoped + RLS read; writes via the service role.
-- No UI.
-- ============================================================================
create table if not exists public.broker_ai_coaching (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  broker_id           uuid not null references public.broker_profiles(id) on delete cascade,
  generated_at        timestamptz not null default now(),
  model_version       text not null default 'mai-11.0',
  coach_version       text not null default 'v1',

  overall_priority    text,        -- HIGH | MEDIUM | LOW | NONE
  overall_confidence  numeric not null default 0,

  -- ── Structured coaching (evidence-backed, never free text) ────────────────
  recommendations     jsonb not null default '[]'::jsonb,
  insights            jsonb not null default '[]'::jsonb,
  warnings            jsonb not null default '[]'::jsonb,
  opportunities       jsonb not null default '[]'::jsonb,
  strengths           jsonb not null default '[]'::jsonb,

  -- ── Traceability + daily coach summary ────────────────────────────────────
  evidence            jsonb not null default '[]'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One current coaching record per broker + coach version (re-runs upsert).
create unique index if not exists bac_broker_version_uidx
  on public.broker_ai_coaching (organization_id, broker_id, coach_version);

create index if not exists bac_org_idx          on public.broker_ai_coaching (organization_id);
create index if not exists bac_org_priority_idx  on public.broker_ai_coaching (organization_id, overall_priority);
create index if not exists bac_org_generated_idx on public.broker_ai_coaching (organization_id, generated_at);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.broker_ai_coaching enable row level security;

drop policy if exists bac_select on public.broker_ai_coaching;
create policy bac_select on public.broker_ai_coaching
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.broker_ai_coaching to authenticated;
