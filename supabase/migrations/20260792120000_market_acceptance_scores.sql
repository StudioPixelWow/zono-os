-- ============================================================================
-- PHASE MAI-3 — Market Exit & Acceptance Confidence Engine.
--
-- The FIRST interpretation layer: turns the observable MAI-2 signals into
-- cautious, explainable confidence models. It NEVER claims a property was sold
-- and NEVER creates an official sale record. DISAPPEARED is a fact; SOLD is not.
-- classification is "likely" only — OFFICIAL_TRANSACTION_FOUND requires a real
-- matched official transaction (not produced in MAI-3).
--
-- Deterministic + explainable: every score carries evidence + a Hebrew
-- explanation. No valuation / heatmap / decision-brain wiring in this phase.
-- ============================================================================
create table if not exists public.market_acceptance_scores (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  provider                      text not null,
  external_id                   text not null,
  signal_version                text not null,
  model_version                 text not null,
  calculated_at                 timestamptz not null default now(),
  market_exit_confidence        numeric,
  market_acceptance_confidence  numeric,
  market_rejection_confidence   numeric,
  classification                text not null,   -- ACTIVE | LIKELY_MARKET_EXIT | LIKELY_ACCEPTED | LIKELY_REJECTED | UNCERTAIN | RETURNED | OFFICIAL_TRANSACTION_FOUND
  evidence                      jsonb not null default '[]'::jsonb,
  confidence_inputs             jsonb not null default '{}'::jsonb,
  explanation                   text,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (organization_id, provider, external_id, model_version)
);

create index if not exists mas_org_classification_idx on public.market_acceptance_scores (organization_id, classification);
create index if not exists mas_org_calc_idx            on public.market_acceptance_scores (organization_id, calculated_at);
create index if not exists mas_org_provider_ext_idx    on public.market_acceptance_scores (organization_id, provider, external_id);

alter table public.market_acceptance_scores enable row level security;

drop policy if exists mas_select on public.market_acceptance_scores;
create policy mas_select on public.market_acceptance_scores
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_acceptance_scores to authenticated;
