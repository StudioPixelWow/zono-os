-- ============================================================================
-- PHASE MAI-2 — Market Acceptance Intelligence™ SIGNAL ENGINE.
--
-- Stores independent, observable market SIGNALS computed from each listing's
-- lifecycle + event history. EVIDENCE ONLY — no scores, no "likely sold", no
-- probability, no AI/valuation/heatmap interpretation (those are later phases).
--
-- One row per (org, provider, external_id). `signals` is a jsonb map of
-- name → { value, source, lastUpdated, confidence }. Recomputed after every
-- external sync; the prior snapshot is retained under metadata.previous so
-- later phases can compare. Org-scoped + RLS read; service-role writes.
-- ============================================================================
create table if not exists public.market_listing_signals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  provider            text not null,
  external_id         text not null,
  lifecycle_id        uuid references public.market_listing_lifecycle(id) on delete set null,
  signal_version      text not null default 'mai-2.0',
  last_calculated_at  timestamptz not null default now(),
  signals             jsonb not null default '{}'::jsonb,   -- name → { value, source, lastUpdated, confidence }
  confidence_inputs   jsonb not null default '{}'::jsonb,   -- which fields fed confidence (for explainability)
  metadata            jsonb not null default '{}'::jsonb,   -- { previous: <prior signals> } etc.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create index if not exists mls_org_provider_ext_idx on public.market_listing_signals (organization_id, provider, external_id);
create index if not exists mls_org_calc_idx          on public.market_listing_signals (organization_id, last_calculated_at);
create index if not exists mls_lifecycle_idx          on public.market_listing_signals (lifecycle_id);

alter table public.market_listing_signals enable row level security;

drop policy if exists mls_select on public.market_listing_signals;
create policy mls_select on public.market_listing_signals
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_listing_signals to authenticated;
