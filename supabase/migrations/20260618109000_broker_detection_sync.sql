-- ============================================================================
-- ZONO — 0026 · Broker Detection Sync Integration
-- ----------------------------------------------------------------------------
-- Detection now runs as part of the external-listings sync. These fields track
-- detection state and LOCK human decisions so re-sync never overwrites them.
-- ============================================================================

alter table public.external_listings
  add column if not exists broker_detection_status    text not null default 'unknown',
  add column if not exists broker_detection_source     text,
  add column if not exists broker_detection_last_run_at timestamptz,
  add column if not exists broker_detection_locked      boolean not null default false;

create index if not exists external_listings_detection_status_idx on public.external_listings(broker_detection_status);
create index if not exists external_listings_detection_locked_idx on public.external_listings(broker_detection_locked);
