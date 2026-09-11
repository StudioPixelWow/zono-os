-- ============================================================================
-- ZONO — pagination scope indexes (REVIEW COPY — do NOT auto-apply)
-- ----------------------------------------------------------------------------
-- The server-side command boards each run a bounded scope fetch of the form
--   SELECT <cols> FROM <table> WHERE org_id = $1 ORDER BY <ts> DESC LIMIT <cap>
-- RLS already scopes rows to the org; the ORDER BY <ts> DESC has no covering
-- index today, so Postgres sorts the org's rows on every page load. These
-- composite indexes let the planner satisfy the org filter AND the ordering
-- from one index, so the LIMIT stops early.
--
-- Each is `IF NOT EXISTS` and additive (no data change, no lock on reads).
-- A plain CREATE INDEX takes a brief write lock while it builds. On small/medium
-- tables that is momentary. For very large tables, run the CONCURRENTLY variant
-- (bottom of this file) MANUALLY, one statement at a time, OUTSIDE a transaction
-- (CONCURRENTLY cannot run inside the migration runner's transaction block).
--
-- Existing indexes that already cover the org filter (kept — do NOT drop):
--   buyers(org_id), buyers(org_id,temperature), sellers(org_id),
--   leads(org_id), leads(org_id,stage), offers(org_id), offers(org_id,status),
--   documents(org_id,status), documents(org_id,signature_status),
--   deal_profiles(organization_id), properties(org_id), properties(org_id,status)
-- These NEW indexes add the missing ORDER-BY dimension only.
-- ============================================================================

-- Buyers board  → board-query.ts: ORDER BY updated_at DESC
create index if not exists buyers_org_updated_idx
  on public.buyers (org_id, updated_at desc);

-- Sellers board → board-query.ts: ORDER BY updated_at DESC
create index if not exists sellers_org_updated_idx
  on public.sellers (org_id, updated_at desc);

-- Leads board   → board-query.ts: ORDER BY created_at DESC
create index if not exists leads_org_created_idx
  on public.leads (org_id, created_at desc);

-- Offers board  → service.listOffers: ORDER BY updated_at DESC
create index if not exists offers_org_updated_idx
  on public.offers (org_id, updated_at desc);

-- Documents     → service.getDocumentsCommandCenter: ORDER BY updated_at DESC
create index if not exists documents_org_updated_idx
  on public.documents (org_id, updated_at desc);

-- Deals board   → service.getDealsBoard: WHERE status='active' ORDER BY deal_value DESC
create index if not exists deal_profiles_org_status_value_idx
  on public.deal_profiles (organization_id, status, deal_value desc);

-- ----------------------------------------------------------------------------
-- OPTIONAL — very large tables only. Run these MANUALLY, one at a time, OUTSIDE
-- a transaction (psql: no BEGIN/COMMIT around them). Do NOT keep these in the
-- migration file if your runner wraps migrations in a transaction.
-- ----------------------------------------------------------------------------
-- create index concurrently if not exists buyers_org_updated_idx               on public.buyers (org_id, updated_at desc);
-- create index concurrently if not exists sellers_org_updated_idx              on public.sellers (org_id, updated_at desc);
-- create index concurrently if not exists leads_org_created_idx                on public.leads (org_id, created_at desc);
-- create index concurrently if not exists offers_org_updated_idx               on public.offers (org_id, updated_at desc);
-- create index concurrently if not exists documents_org_updated_idx            on public.documents (org_id, updated_at desc);
-- create index concurrently if not exists deal_profiles_org_status_value_idx   on public.deal_profiles (organization_id, status, deal_value desc);
