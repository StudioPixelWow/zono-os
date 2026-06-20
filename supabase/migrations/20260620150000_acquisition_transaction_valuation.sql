-- ============================================================================
-- ZONO — 0043 · Acquisition × Transactions Deep Integration (Part 1)
-- ----------------------------------------------------------------------------
-- Adds sold-price transaction valuation to each acquisition profile: how the
-- asking price sits vs the market value derived from real government sold-price
-- comparables (property_research_reports). Deterministic, never invented.
-- Idempotent.
-- ============================================================================

alter table public.inventory_acquisition_profiles
  add column if not exists transaction_valuation_score smallint not null default 0,
  add column if not exists transaction_gap_percent     numeric,
  add column if not exists transaction_confidence       smallint not null default 0,
  add column if not exists transaction_comparables      smallint not null default 0,
  add column if not exists research_report_id           uuid references public.property_research_reports(id) on delete set null;

create index if not exists inv_acq_profiles_txn_val_idx
  on public.inventory_acquisition_profiles(transaction_valuation_score desc);
