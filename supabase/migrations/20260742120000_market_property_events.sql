-- ============================================================================
-- ZONO Property Radar™ — Phase 11: Daily Market Events Engine.
-- ----------------------------------------------------------------------------
-- market_property_events records meaningful changes detected during the nightly
-- refresh of the SHARED market cache (price drops/increases, removed, back on
-- market, status/metadata changes, buyer-relevance gained/lost, hot deals).
-- It is a SHARED system table (no org_id, service-role only) — org-specific
-- consequences (matches/alerts/tasks) are written to the existing per-org
-- tables. Additive + idempotent. Conventions: public.set_updated_at() not needed
-- (events are immutable).
-- ============================================================================

create table if not exists public.market_property_events (
  id                        uuid primary key default gen_random_uuid(),
  market_property_source_id uuid references public.market_property_sources(id) on delete cascade,
  provider                  text not null,
  market_area_key           text,
  city                      text,
  neighborhood              text,
  -- price_drop / price_increase / removed / back_on_market / status_changed /
  -- metadata_changed / buyer_match_gained / buyer_match_lost / hot_deal
  event_type                text not null,
  previous_value            jsonb default '{}'::jsonb,
  next_value                jsonb default '{}'::jsonb,
  price_delta               numeric,
  price_delta_percent       numeric,
  -- low / medium / high / urgent
  severity                  text default 'medium',
  detected_at               timestamptz default now(),
  created_at                timestamptz default now(),
  metadata                  jsonb default '{}'::jsonb
);

create index if not exists mpe_source_idx     on public.market_property_events(market_property_source_id);
create index if not exists mpe_provider_idx    on public.market_property_events(provider);
create index if not exists mpe_area_key_idx     on public.market_property_events(market_area_key);
create index if not exists mpe_city_idx         on public.market_property_events(city);
create index if not exists mpe_neighborhood_idx on public.market_property_events(neighborhood);
create index if not exists mpe_event_type_idx   on public.market_property_events(event_type);
create index if not exists mpe_severity_idx     on public.market_property_events(severity);
create index if not exists mpe_detected_at_idx  on public.market_property_events(detected_at);

-- Optional supporting indexes on the shared sources table (cheap refresh scans).
create index if not exists mps_source_status_idx2          on public.market_property_sources(source_status);
create index if not exists mps_last_seen_idx2              on public.market_property_sources(last_seen_at);
create index if not exists mps_provider_area_status_idx    on public.market_property_sources(provider, market_area_key, source_status);

-- ── RLS: shared system table — service role only, never authenticated ────────
alter table public.market_property_events enable row level security;
revoke all on public.market_property_events from authenticated;
grant all privileges on public.market_property_events to service_role;
