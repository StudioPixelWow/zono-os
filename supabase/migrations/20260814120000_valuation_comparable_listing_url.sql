-- ============================================================================
-- ZONO — Phase VAL-QA-6: persist the real public listing URL for comparables so
-- the result-view cards can be CLICKED through to the real source ("פתח מודעה").
-- STRICTLY ADDITIVE + idempotent. No data change, no backfill, no fabrication.
-- A NULL listing_url simply means "no public link" — the UI shows it honestly.
-- ============================================================================
alter table if exists public.valuation_comparables
  add column if not exists listing_url text;
