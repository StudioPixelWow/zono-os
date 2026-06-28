-- ============================================================================
-- ZONO Core Data — Brokerage EVOLUTION INTELLIGENCE™ (historical layer).
-- Strictly ADDITIVE on top of brokerage data + knowledge graph. Turns the
-- current-state knowledge into a HISTORICAL intelligence engine: how offices,
-- agents, neighborhoods, competition and the market evolve over time.
--
-- Reuses existing structures (no duplication):
--   • brokerage_timeline_events  → the append-only EVOLUTION EVENT STREAM
--   • brokerage_graph_nodes/edges, brokerage_market_share, brokerage_coverage
-- Adds only the temporal backbone + derived profiles below. Owner-vs-city RLS,
-- audit + explainability preserved. Optimized for long-term storage (indexed,
-- snapshot-keyed, append-only events).
-- ============================================================================

-- ── 1) Entity snapshots — periodic point-in-time metrics (the time backbone) ─
create table if not exists public.brokerage_entity_snapshots (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null,           -- office | agent | neighborhood | city | network | market
  entity_id       uuid,                     -- set for office/agent
  entity_key      text not null,            -- stable key: "office:<uuid>" / "city:<norm>" / "nbhd:<city>|<n>"
  city            text,
  period          text not null default 'month', -- day | week | month | year
  period_date     date not null,            -- bucket start (e.g. first of month)
  listings        integer not null default 0,
  agents          integer not null default 0,
  market_share    numeric not null default 0,
  activity        numeric not null default 0,
  data_quality    numeric not null default 0,
  cities_count    integer not null default 0,
  neighborhoods_count integer not null default 0,
  metrics         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (entity_key, period, period_date)
);
create index if not exists bes_key_date_idx  on public.brokerage_entity_snapshots (entity_key, period_date desc);
create index if not exists bes_type_date_idx on public.brokerage_entity_snapshots (entity_type, period, period_date desc);
create index if not exists bes_city_idx      on public.brokerage_entity_snapshots (city);
create index if not exists bes_date_idx      on public.brokerage_entity_snapshots (period_date desc);

-- ── 2) Entity DNA — dynamic office/agent profile (incl. agent career) ───────
create table if not exists public.brokerage_entity_dna (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,               -- office | agent
  entity_id    uuid not null,
  city         text,
  dna          jsonb not null default '{}'::jsonb,   -- specialization, property_types, price range, luxury/commercial/rental/project %, cities, neighborhoods, digital presence, growth pattern, risk
  career       jsonb not null default '{}'::jsonb,   -- agents: experience, career/stability/growth scores, expertise
  confidence   numeric not null default 0,
  evidence     jsonb not null default '[]'::jsonb,
  computed_at  timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index if not exists bedna_city_idx on public.brokerage_entity_dna (city);
create index if not exists bedna_type_idx on public.brokerage_entity_dna (entity_type);

-- ── 3) Neighborhood dominance ───────────────────────────────────────────────
create table if not exists public.brokerage_neighborhood_stats (
  id                uuid primary key default gen_random_uuid(),
  city              text not null,
  neighborhood      text not null,
  leading_office_id uuid,
  leading_agent_id  uuid,
  listing_volume    integer not null default 0,
  avg_price         numeric,
  price_trend       numeric not null default 0,
  activity_trend    numeric not null default 0,
  competition_level text,                    -- low | medium | high
  concentration     numeric not null default 0,  -- HHI 0..1
  market_share      numeric not null default 0,  -- leader share
  coverage_pct      numeric not null default 0,
  growth            numeric not null default 0,
  dna               jsonb not null default '{}'::jsonb,
  confidence        numeric not null default 0,
  computed_at       timestamptz not null default now(),
  unique (city, neighborhood)
);
create index if not exists bns_city_idx on public.brokerage_neighborhood_stats (city);

-- ── 4) Market DNA (per city) ────────────────────────────────────────────────
create table if not exists public.brokerage_market_dna (
  id                       uuid primary key default gen_random_uuid(),
  city                     text not null,
  dominant_office_category text,
  dominant_property_category text,
  competition_intensity    numeric not null default 0,
  growth_trend             numeric not null default 0,
  luxury_concentration     numeric not null default 0,
  developer_concentration  numeric not null default 0,
  office_density           numeric not null default 0,
  agent_density            numeric not null default 0,
  volatility               numeric not null default 0,
  avg_confidence           numeric not null default 0,
  metrics                  jsonb not null default '{}'::jsonb,
  computed_at              timestamptz not null default now(),
  unique (city)
);
create index if not exists bmd_city_idx on public.brokerage_market_dna (city);

-- ── 5) Predictions (historical-trend based, never presented as fact) ────────
create table if not exists public.brokerage_predictions (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text,                       -- office | agent | city | neighborhood
  entity_id      uuid,
  entity_key     text,
  city           text,
  prediction_type text not null,             -- office_growth|office_decline|branch_expansion|office_closure|agent_movement|specialization_change
  likelihood     numeric not null default 0, -- 0..100
  confidence     numeric not null default 0, -- 0..100
  evidence       jsonb not null default '[]'::jsonb,
  explanation    text,
  horizon_days   integer not null default 90,
  status         text not null default 'open', -- open | confirmed | expired | dismissed
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create index if not exists bpred_status_idx on public.brokerage_predictions (status);
create index if not exists bpred_type_idx   on public.brokerage_predictions (prediction_type);
create index if not exists bpred_city_idx   on public.brokerage_predictions (city);

-- ============================================================================
-- RLS — owner sees all; office/agent users see city-scoped history only.
-- Writes are service-role. Reuses is_zono_owner() / brokerage_city_visible().
-- ============================================================================
alter table public.brokerage_entity_snapshots    enable row level security;
alter table public.brokerage_entity_dna           enable row level security;
alter table public.brokerage_neighborhood_stats   enable row level security;
alter table public.brokerage_market_dna           enable row level security;
alter table public.brokerage_predictions          enable row level security;

drop policy if exists bes_select on public.brokerage_entity_snapshots;
create policy bes_select on public.brokerage_entity_snapshots for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bedna_select on public.brokerage_entity_dna;
create policy bedna_select on public.brokerage_entity_dna for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bns_select on public.brokerage_neighborhood_stats;
create policy bns_select on public.brokerage_neighborhood_stats for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bmd_select on public.brokerage_market_dna;
create policy bmd_select on public.brokerage_market_dna for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bpred_select on public.brokerage_predictions;
create policy bpred_select on public.brokerage_predictions for select to authenticated using (public.brokerage_city_visible(city));

grant select on
  public.brokerage_entity_snapshots, public.brokerage_entity_dna, public.brokerage_neighborhood_stats,
  public.brokerage_market_dna, public.brokerage_predictions
to authenticated;
