-- ============================================================================
-- ZONO — Group/Marketplace destination columns (Phase 21, additive).
-- ----------------------------------------------------------------------------
-- Extends distribution_provider_destinations so the user can MANUALLY add
-- Facebook GROUP / MARKETPLACE destinations (destination_type already free-text):
--   • destination_url — the group/marketplace URL the user opens in their browser
--   • last_used_at    — when a post was last sent to this destination
-- No Facebook credentials, cookies, or session data are stored. Discovery of
-- groups is NOT automated — these rows are created by hand in the ZONO UI.
-- ============================================================================
alter table public.distribution_provider_destinations
  add column if not exists destination_url text,
  add column if not exists last_used_at    timestamptz;

-- external_id was NOT NULL (it carried the Meta Page id for discovered Pages).
-- Manually-added groups/marketplace destinations have no external id, so make it
-- nullable. The unique key (org_id, provider, destination_type, external_id)
-- still holds — Postgres treats NULL external_id rows as distinct, so multiple
-- hand-added groups never collide.
alter table public.distribution_provider_destinations
  alter column external_id drop not null;
