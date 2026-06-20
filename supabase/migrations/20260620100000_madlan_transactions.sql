-- ============================================================================
-- ZONO — 0041 · Madlan City Transactions (primary city coverage source)
-- ----------------------------------------------------------------------------
-- Adds Madlan-specific columns to property_transactions so the same table holds
-- both sources: source_platform='madlan_transactions' (primary, full-city) and
-- 'govmap_transactions' (government validation / backup). Idempotent.
-- ============================================================================

alter table public.property_transactions add column if not exists madlan_transaction_id text;
alter table public.property_transactions add column if not exists building_year integer;
alter table public.property_transactions add column if not exists mediation text;       -- agency/broker indication if present
alter table public.property_transactions add column if not exists source_url text;
alter table public.property_transactions add column if not exists duplicate_of uuid references public.property_transactions(id) on delete set null;

-- Primary dedup for Madlan rows: one row per (org, madlan_transaction_id).
create unique index if not exists property_transactions_madlan_uniq
  on public.property_transactions(organization_id, madlan_transaction_id) where madlan_transaction_id is not null;
create index if not exists property_transactions_platform_idx on public.property_transactions(source_platform);
create index if not exists property_transactions_building_year_idx on public.property_transactions(building_year);
