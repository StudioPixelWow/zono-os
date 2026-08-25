-- ============================================================================
-- ZONO 10.2B — LIVE RUNTIME ACCEPTANCE: repair properties.formatted_address drift.
-- The column is defined by migration 20260618094000 and read/written across the
-- deployed code (my-properties inventory query, global search, buyer-match address,
-- geo pipeline), but production had drifted — the column was missing, so /my-properties
-- (and search + inventory) threw "column properties.formatted_address does not exist"
-- and rendered the error boundary. Additive, nullable, idempotent — no data loss.
-- (Applied live to production during 10.2B; this file keeps the repo the source of
-- truth so any environment rebuilt from migrations includes it.)
-- ============================================================================
alter table public.properties
  add column if not exists formatted_address text;
