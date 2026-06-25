-- ============================================================================
-- ZONO Property Radar™ — CONSOLIDATED, IDEMPOTENT SQL (safe to re-run).
-- Paste this whole file into the Supabase SQL editor and run it.
-- Everything uses IF NOT EXISTS / DROP ... IF EXISTS, so anything already
-- pushed is SKIPPED — no errors on re-run. Order matters (foundation first).
--   1) Phase 1   — property_radar foundation (6 org tables + RLS)
--   2) Phase 8.5 — shared market cache (5 system/bridge tables + RLS)
--   3) Phase 10  — buyer_property_matches (+ RLS)
--   4) Phase 11  — market_property_events (+ indexes)
--   5) Realtime  — optional: property_alerts live popup (guarded)
-- ============================================================================


-- ###########################################################################
-- ##  20260739120000_property_radar_foundation.sql
-- ###########################################################################
-- ============================================================================
-- ZONO Property Radar™ — Phase 1 foundation (additive + idempotent).
-- ----------------------------------------------------------------------------
-- Database backbone for an automatic property radar that will later scan Yad2 /
-- Madlan incrementally, detect new/updated/deleted listings, save credits, score
-- opportunities and trigger smart alerts. THIS PHASE IS FOUNDATION ONLY — no
-- scraping, no UI, no scheduler. Just tables, RLS, triggers, indexes.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── A. property_sync_sources — every external listing identity ───────────────
create table if not exists public.property_sync_sources (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  provider            text not null,                      -- yad2 | madlan
  external_id         text not null,
  external_url        text,
  listing_type        text default 'unknown',             -- private | broker | project | unknown
  source_status       text default 'active',              -- active | missing | deleted | error
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
  linked_property_id  uuid references public.properties(id) on delete set null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (org_id, provider, external_id)
);
create index if not exists pss_org_idx          on public.property_sync_sources(org_id);
create index if not exists pss_provider_idx      on public.property_sync_sources(provider);
create index if not exists pss_external_id_idx   on public.property_sync_sources(external_id);
create index if not exists pss_city_idx          on public.property_sync_sources(city);
create index if not exists pss_neighborhood_idx  on public.property_sync_sources(neighborhood);
create index if not exists pss_listing_type_idx  on public.property_sync_sources(listing_type);
create index if not exists pss_source_status_idx on public.property_sync_sources(source_status);
create index if not exists pss_published_at_idx  on public.property_sync_sources(published_at);
create index if not exists pss_last_seen_idx     on public.property_sync_sources(last_seen_at);
create index if not exists pss_content_hash_idx  on public.property_sync_sources(content_hash);
create index if not exists pss_linked_prop_idx   on public.property_sync_sources(linked_property_id);

-- ── B. property_sync_runs — every automatic / manual sync run ────────────────
create table if not exists public.property_sync_runs (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  provider               text not null,
  area_id                uuid,
  city                   text,
  neighborhood           text,
  run_type               text default 'automatic',        -- automatic | manual | validation
  status                 text default 'running',          -- running | success | partial | failed
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
  stop_reason            text,
  error_message          text,
  metadata               jsonb default '{}'::jsonb,
  created_at             timestamptz default now()
);
create index if not exists psr_org_idx          on public.property_sync_runs(org_id);
create index if not exists psr_provider_idx      on public.property_sync_runs(provider);
create index if not exists psr_area_idx          on public.property_sync_runs(area_id);
create index if not exists psr_city_idx          on public.property_sync_runs(city);
create index if not exists psr_neighborhood_idx  on public.property_sync_runs(neighborhood);
create index if not exists psr_status_idx        on public.property_sync_runs(status);
create index if not exists psr_started_at_idx    on public.property_sync_runs(started_at);

-- ── C. property_sync_watermarks — incremental scan checkpoints ───────────────
create table if not exists public.property_sync_watermarks (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references public.organizations(id) on delete cascade,
  provider                      text not null,
  area_id                       uuid,
  city                          text,
  neighborhood                  text,
  latest_external_id            text,
  latest_published_at           timestamptz,
  latest_seen_hash              text,
  last_successful_scan_at       timestamptz,
  last_page_scanned             int default 1,
  unchanged_streak_stop_threshold int default 15,
  max_pages_per_scan            int default 3,
  stop_reason                   text,
  metadata                      jsonb default '{}'::jsonb,
  created_at                    timestamptz default now(),
  updated_at                    timestamptz default now(),
  unique (org_id, provider, area_id, city, neighborhood)
);
create index if not exists psw_org_idx         on public.property_sync_watermarks(org_id);
create index if not exists psw_provider_idx     on public.property_sync_watermarks(provider);
create index if not exists psw_area_idx         on public.property_sync_watermarks(area_id);
create index if not exists psw_city_idx         on public.property_sync_watermarks(city);
create index if not exists psw_neighborhood_idx on public.property_sync_watermarks(neighborhood);
create index if not exists psw_last_scan_idx    on public.property_sync_watermarks(last_successful_scan_at);

-- ── D. property_alerts — agent-facing opportunity alerts ─────────────────────
create table if not exists public.property_alerts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  agent_id            uuid references public.users(id) on delete set null,
  property_source_id  uuid references public.property_sync_sources(id) on delete set null,
  linked_property_id  uuid references public.properties(id) on delete set null,
  alert_type          text not null,   -- new_private_property | high_opportunity | price_drop | updated_property | deleted_property | buyer_match
  title               text not null,
  message             text,
  priority            text default 'high',     -- low | medium | high | urgent
  status              text default 'unread',   -- unread | shown | read | dismissed | contacted
  opportunity_score   int,
  shown_at            timestamptz,
  clicked_at          timestamptz,
  dismissed_at        timestamptz,
  contacted_at        timestamptz,
  created_at          timestamptz default now(),
  metadata            jsonb default '{}'::jsonb
);
create index if not exists pa_org_idx          on public.property_alerts(org_id);
create index if not exists pa_agent_idx         on public.property_alerts(agent_id);
create index if not exists pa_source_idx        on public.property_alerts(property_source_id);
create index if not exists pa_linked_prop_idx   on public.property_alerts(linked_property_id);
create index if not exists pa_type_idx          on public.property_alerts(alert_type);
create index if not exists pa_priority_idx      on public.property_alerts(priority);
create index if not exists pa_status_idx        on public.property_alerts(status);
create index if not exists pa_score_idx         on public.property_alerts(opportunity_score);
create index if not exists pa_created_at_idx    on public.property_alerts(created_at);

-- ── E. property_opportunity_scores — calculated opportunity intelligence ─────
create table if not exists public.property_opportunity_scores (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  property_source_id          uuid references public.property_sync_sources(id) on delete cascade,
  linked_property_id          uuid references public.properties(id) on delete set null,
  total_score                 int default 0,
  private_listing_score       int default 0,
  area_expertise_score        int default 0,
  buyer_match_score           int default 0,
  market_price_score          int default 0,
  freshness_score             int default 0,
  rarity_score                int default 0,
  seller_motivation_score     int default 0,
  exclusivity_potential_score int default 0,
  reasons                     jsonb default '[]'::jsonb,
  recommendation              text,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),
  unique (org_id, property_source_id)
);
create index if not exists pos_org_idx         on public.property_opportunity_scores(org_id);
create index if not exists pos_source_idx       on public.property_opportunity_scores(property_source_id);
create index if not exists pos_linked_prop_idx  on public.property_opportunity_scores(linked_property_id);
create index if not exists pos_total_score_idx  on public.property_opportunity_scores(total_score);
create index if not exists pos_created_at_idx   on public.property_opportunity_scores(created_at);

-- ── F. property_radar_settings — org-level radar / sync settings ─────────────
create table if not exists public.property_radar_settings (
  id                              uuid primary key default gen_random_uuid(),
  org_id                          uuid not null unique references public.organizations(id) on delete cascade,
  sync_enabled                    boolean default true,
  smart_sync_enabled              boolean default true,
  provider_yad2_enabled           boolean default true,
  provider_madlan_enabled         boolean default true,
  private_property_alerts_enabled boolean default true,
  popup_alerts_enabled            boolean default true,
  only_private_popups             boolean default true,
  min_popup_opportunity_score     int default 70,
  max_daily_credits               int default 1000,
  max_pages_per_scan              int default 3,
  unchanged_streak_stop_threshold int default 15,
  max_popups_per_10_minutes       int default 3,
  quiet_mode_enabled              boolean default false,
  whatsapp_template               text,
  created_at                      timestamptz default now(),
  updated_at                      timestamptz default now()
);
create index if not exists prs_org_idx on public.property_radar_settings(org_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists trg_property_sync_sources_updated on public.property_sync_sources;
create trigger trg_property_sync_sources_updated before update on public.property_sync_sources for each row execute function public.set_updated_at();
drop trigger if exists trg_property_sync_watermarks_updated on public.property_sync_watermarks;
create trigger trg_property_sync_watermarks_updated before update on public.property_sync_watermarks for each row execute function public.set_updated_at();
drop trigger if exists trg_property_opportunity_scores_updated on public.property_opportunity_scores;
create trigger trg_property_opportunity_scores_updated before update on public.property_opportunity_scores for each row execute function public.set_updated_at();
drop trigger if exists trg_property_radar_settings_updated on public.property_radar_settings;
create trigger trg_property_radar_settings_updated before update on public.property_radar_settings for each row execute function public.set_updated_at();

-- ── RLS — strict org isolation. Read: same org. Write: agent+ in same org.
--          Service role (scheduler / import) bypasses RLS entirely. ───────────
do $$
declare t text;
begin
  foreach t in array array[
    'property_sync_sources','property_sync_runs','property_sync_watermarks',
    'property_alerts','property_opportunity_scores','property_radar_settings'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;


-- ###########################################################################
-- ##  20260740120000_market_shared_cache.sql
-- ###########################################################################
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


-- ###########################################################################
-- ##  20260741120000_buyer_property_matches.sql
-- ###########################################################################
-- ============================================================================
-- ZONO Property Radar™ — Phase 10: Real Buyer Matching Engine.
-- ----------------------------------------------------------------------------
-- buyer_property_matches: one row per (buyer, shared market property) the
-- deterministic matching engine produced. The engine writes via the service
-- role (system); each org reads + updates ONLY its own rows (RLS). The matching
-- logic is deterministic + fast (no AI) — this table stores the result + an
-- explainable breakdown. An optional AI layer may later enrich `explanation`
-- without changing the deterministic scores. Additive + idempotent.
-- Conventions: public.current_org_id(), public.set_updated_at().
-- ============================================================================

create table if not exists public.buyer_property_matches (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  buyer_id                  uuid not null references public.buyers(id) on delete cascade,
  market_property_source_id uuid not null references public.market_property_sources(id) on delete cascade,
  linked_property_id        uuid references public.properties(id) on delete set null,

  match_score               int  not null default 0,
  -- perfect | excellent | good | possible | rejected
  match_level               text not null default 'possible',

  -- per-dimension sub-scores (0..weight); explainable + auditable
  price_score               int  not null default 0,
  location_score            int  not null default 0,
  rooms_score               int  not null default 0,
  property_type_score       int  not null default 0,
  size_score                int  not null default 0,
  parking_score             int  not null default 0,
  balcony_score             int  not null default 0,
  floor_score               int  not null default 0,
  timeline_score            int  not null default 0,
  manual_bonus              int  not null default 0,
  manual_penalty            int  not null default 0,

  explanation               jsonb not null default '{}'::jsonb,
  -- new | viewed | contacted | dismissed | converted
  status                    text  not null default 'new',
  -- becomes false when the underlying property is deleted/removed
  is_active                 boolean not null default true,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (buyer_id, market_property_source_id)
);

create index if not exists bpm_org_idx        on public.buyer_property_matches(org_id);
create index if not exists bpm_buyer_idx       on public.buyer_property_matches(buyer_id);
create index if not exists bpm_source_idx       on public.buyer_property_matches(market_property_source_id);
create index if not exists bpm_score_idx        on public.buyer_property_matches(match_score);
create index if not exists bpm_status_idx       on public.buyer_property_matches(status);
create index if not exists bpm_level_idx        on public.buyer_property_matches(match_level);
create index if not exists bpm_org_source_idx   on public.buyer_property_matches(org_id, market_property_source_id);
create index if not exists bpm_org_active_score_idx on public.buyer_property_matches(org_id, is_active, match_score);

drop trigger if exists trg_buyer_property_matches_updated on public.buyer_property_matches;
create trigger trg_buyer_property_matches_updated
  before update on public.buyer_property_matches
  for each row execute function public.set_updated_at();

-- ── RLS: org reads + updates its own matches; engine writes via service role ──
alter table public.buyer_property_matches enable row level security;

drop policy if exists "bpm_select" on public.buyer_property_matches;
create policy "bpm_select" on public.buyer_property_matches
  for select to authenticated using (org_id = public.current_org_id());

-- agents may change the status (viewed/contacted/dismissed/converted) on their
-- own org's matches; they cannot insert or delete (the engine owns creation).
drop policy if exists "bpm_update" on public.buyer_property_matches;
create policy "bpm_update" on public.buyer_property_matches
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

grant select, update on public.buyer_property_matches to authenticated;
grant all privileges on public.buyer_property_matches to service_role;


-- ###########################################################################
-- ##  20260742120000_market_property_events.sql
-- ###########################################################################
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


-- ###########################################################################
-- ##  OPTIONAL — realtime for the global alert popup (guarded, idempotent)
-- ##  Skips silently if the publication is missing or the table already added.
-- ###########################################################################
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'property_alerts'
     ) then
    execute 'alter publication supabase_realtime add table public.property_alerts';
  end if;
end $$;
