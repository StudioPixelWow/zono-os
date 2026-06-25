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
