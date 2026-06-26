-- ============================================================================
-- PHASE MAI-5 — Valuation Weight Engine™ (Market Acceptance integration).
--
-- A TRANSPARENT weighting layer that combines multiple evidence sources into a
-- valuation CONFIDENCE + range. It does NOT replace the valuation model and does
-- NOT change the estimated VALUE — official transactions remain the strongest
-- source and the central value always comes from the existing AVM engine.
-- Market Acceptance Intelligence is one additional, weighted signal that may
-- slightly raise/lower confidence and narrow/widen the range — never override a
-- verified transaction, never invent a sale price. Deterministic, no AI/LLM.
-- ============================================================================
create table if not exists public.valuation_weight_results (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  property_id                   uuid,
  valuation_id                  uuid,
  provider                      text,
  external_id                   text,
  valuation_version             text not null,
  weight_profile                text not null default 'STANDARD',
  calculated_at                 timestamptz not null default now(),
  official_transactions_weight  numeric,
  current_market_weight         numeric,
  market_acceptance_weight      numeric,
  market_trend_weight           numeric,
  listing_similarity_weight     numeric,
  location_weight               numeric,
  property_features_weight      numeric,
  final_confidence              numeric,
  estimated_value               numeric,
  estimated_low                 numeric,
  estimated_high                numeric,
  evidence                      jsonb not null default '[]'::jsonb,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- One current result per valuation + profile (re-runs upsert in place).
create unique index if not exists vwr_valuation_profile_uidx
  on public.valuation_weight_results (organization_id, valuation_id, weight_profile)
  nulls not distinct;

create index if not exists vwr_org_property_idx on public.valuation_weight_results (organization_id, property_id);
create index if not exists vwr_org_calc_idx     on public.valuation_weight_results (organization_id, calculated_at);

alter table public.valuation_weight_results enable row level security;

drop policy if exists vwr_select on public.valuation_weight_results;
create policy vwr_select on public.valuation_weight_results
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.valuation_weight_results to authenticated;
