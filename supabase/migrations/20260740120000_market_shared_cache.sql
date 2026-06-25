-- ============================================================================
-- ZONO Property Radar™ — Phase 8.5: Shared Market Cache & National Index.
-- ----------------------------------------------------------------------------
-- Scale refactor: scan each provider+area ONCE into a shared market cache, then
-- fan out org-specific opportunity scores + alerts. The four market_* tables are
-- SHARED SYSTEM tables (no org_id, service-role only). org_market_property_links
-- is the per-org bridge (RLS: org reads its own links). Additive + idempotent.
-- Conventions: public.current_org_id(), public.set_updated_at().
-- ============================================================================

-- ── A. market_property_sources — global shared listing cache ─────────────────
create table if not exists public.market_property_sources (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  external_id         text not null,
  external_url        text,
  listing_type        text default 'unknown',
  source_status       text default 'active',
  title               text,
  city                text,
  neighborhood        text,
  street              text,
  address_text        text,
  property_type       text,
  price               numeric,
  rooms               numeric,
  floor               text,
  size_sqm            numeric,
  image_url           text,
  phone               text,
  contact_name        text,
  published_at        timestamptz,
  provider_updated_at timestamptz,
  first_seen_at       timestamptz default now(),
  last_seen_at        timestamptz default now(),
  last_full_synced_at timestamptz,
  missing_count       int default 0,
  content_hash        text,
  raw_metadata        jsonb default '{}'::jsonb,
  raw_full_payload    jsonb default '{}'::jsonb,
  market_area_key     text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (provider, external_id)
);
create index if not exists mps_provider_idx       on public.market_property_sources(provider);
create index if not exists mps_external_id_idx     on public.market_property_sources(external_id);
create index if not exists mps_city_idx            on public.market_property_sources(city);
create index if not exists mps_neighborhood_idx    on public.market_property_sources(neighborhood);
create index if not exists mps_listing_type_idx    on public.market_property_sources(listing_type);
create index if not exists mps_source_status_idx   on public.market_property_sources(source_status);
create index if not exists mps_published_at_idx    on public.market_property_sources(published_at);
create index if not exists mps_last_seen_idx       on public.market_property_sources(last_seen_at);
create index if not exists mps_content_hash_idx    on public.market_property_sources(content_hash);
create index if not exists mps_area_key_idx        on public.market_property_sources(market_area_key);

-- ── B. market_sync_runs — global provider+area runs ──────────────────────────
create table if not exists public.market_sync_runs (
  id                     uuid primary key default gen_random_uuid(),
  provider               text not null,
  market_area_key        text not null,
  city                   text,
  neighborhood           text,
  run_type               text default 'automatic',
  status                 text default 'running',
  started_at             timestamptz default now(),
  finished_at            timestamptz,
  scanned_count          int default 0,
  new_count              int default 0,
  updated_count          int default 0,
  unchanged_count        int default 0,
  missing_count          int default 0,
  deleted_count          int default 0,
  full_fetch_count       int default 0,
  credits_used           int default 0,
  credits_saved_estimate int default 0,
  affected_orgs_count    int default 0,
  alerts_created_count   int default 0,
  stop_reason            text,
  error_message          text,
  metadata               jsonb default '{}'::jsonb,
  created_at             timestamptz default now()
);
create index if not exists msr_provider_idx     on public.market_sync_runs(provider);
create index if not exists msr_area_key_idx      on public.market_sync_runs(market_area_key);
create index if not exists msr_city_idx          on public.market_sync_runs(city);
create index if not exists msr_neighborhood_idx  on public.market_sync_runs(neighborhood);
create index if not exists msr_status_idx        on public.market_sync_runs(status);
create index if not exists msr_started_at_idx    on public.market_sync_runs(started_at);

-- ── C. market_sync_watermarks — shared provider+area checkpoint ──────────────
create table if not exists public.market_sync_watermarks (
  id                              uuid primary key default gen_random_uuid(),
  provider                        text not null,
  market_area_key                 text not null,
  city                            text,
  neighborhood                    text,
  latest_external_id              text,
  latest_published_at             timestamptz,
  latest_seen_hash                text,
  last_successful_scan_at         timestamptz,
  last_page_scanned               int default 1,
  ttl_minutes                     int default 60,
  unchanged_streak_stop_threshold int default 15,
  max_pages_per_scan              int default 3,
  stop_reason                     text,
  metadata                        jsonb default '{}'::jsonb,
  created_at                      timestamptz default now(),
  updated_at                      timestamptz default now(),
  unique (provider, market_area_key)
);
create index if not exists msw_provider_idx    on public.market_sync_watermarks(provider);
create index if not exists msw_area_key_idx     on public.market_sync_watermarks(market_area_key);
create index if not exists msw_city_idx         on public.market_sync_watermarks(city);
create index if not exists msw_neighborhood_idx on public.market_sync_watermarks(neighborhood);
create index if not exists msw_last_scan_idx    on public.market_sync_watermarks(last_successful_scan_at);

-- ── D. org_market_property_links — per-org bridge to shared listings ─────────
create table if not exists public.org_market_property_links (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  agent_id                  uuid references public.users(id) on delete set null,
  market_property_source_id uuid references public.market_property_sources(id) on delete cascade,
  linked_property_id        uuid references public.properties(id) on delete set null,
  relevance_status          text default 'relevant', -- relevant|ignored|hidden|converted|not_relevant
  first_matched_at          timestamptz default now(),
  last_evaluated_at         timestamptz default now(),
  opportunity_score         int,
  buyer_match_count         int default 0,
  reasons                   jsonb default '[]'::jsonb,
  recommendation            text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  unique (org_id, market_property_source_id)
);
create index if not exists ompl_org_idx          on public.org_market_property_links(org_id);
create index if not exists ompl_agent_idx         on public.org_market_property_links(agent_id);
create index if not exists ompl_source_idx        on public.org_market_property_links(market_property_source_id);
create index if not exists ompl_relevance_idx     on public.org_market_property_links(relevance_status);
create index if not exists ompl_score_idx         on public.org_market_property_links(opportunity_score);
create index if not exists ompl_created_at_idx    on public.org_market_property_links(created_at);

-- ── E. market_area_cache_state — freshness / TTL per provider+area ───────────
create table if not exists public.market_area_cache_state (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  market_area_key     text not null,
  city                text,
  neighborhood        text,
  last_scan_at        timestamptz,
  next_scan_after     timestamptz,
  ttl_minutes         int default 60,
  status              text default 'fresh', -- fresh|stale|scanning|error
  active_orgs_count   int default 0,
  active_agents_count int default 0,
  listings_count      int default 0,
  last_new_count      int default 0,
  last_updated_count  int default 0,
  last_error_message  text,
  metadata            jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (provider, market_area_key)
);
create index if not exists macs_provider_idx        on public.market_area_cache_state(provider);
create index if not exists macs_area_key_idx         on public.market_area_cache_state(market_area_key);
create index if not exists macs_status_idx           on public.market_area_cache_state(status);
create index if not exists macs_next_scan_after_idx  on public.market_area_cache_state(next_scan_after);
create index if not exists macs_active_orgs_idx      on public.market_area_cache_state(active_orgs_count);

-- ── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists trg_market_property_sources_updated on public.market_property_sources;
create trigger trg_market_property_sources_updated before update on public.market_property_sources for each row execute function public.set_updated_at();
drop trigger if exists trg_market_sync_watermarks_updated on public.market_sync_watermarks;
create trigger trg_market_sync_watermarks_updated before update on public.market_sync_watermarks for each row execute function public.set_updated_at();
drop trigger if exists trg_org_market_property_links_updated on public.org_market_property_links;
create trigger trg_org_market_property_links_updated before update on public.org_market_property_links for each row execute function public.set_updated_at();
drop trigger if exists trg_market_area_cache_state_updated on public.market_area_cache_state;
create trigger trg_market_area_cache_state_updated before update on public.market_area_cache_state for each row execute function public.set_updated_at();

-- ── RLS — shared market tables: SERVICE ROLE ONLY (no org/authenticated read) ─
do $$
declare t text;
begin
  foreach t in array array[
    'market_property_sources','market_sync_runs','market_sync_watermarks','market_area_cache_state'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    -- No authenticated policies → org users cannot read raw shared data.
    -- Service role bypasses RLS; grant explicitly, and keep it OFF authenticated.
    execute format('revoke all on public.%I from authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;

-- org_market_property_links — org reads its own links; writes via service role.
alter table public.org_market_property_links enable row level security;
drop policy if exists "ompl_select" on public.org_market_property_links;
create policy "ompl_select" on public.org_market_property_links
  for select to authenticated using (org_id = public.current_org_id());
grant select on public.org_market_property_links to authenticated;
grant all privileges on public.org_market_property_links to service_role;
