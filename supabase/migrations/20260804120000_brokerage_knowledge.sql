-- ============================================================================
-- ZONO Core Data — Brokerage KNOWLEDGE LAYER (Phase: Knowledge Graph & Data
-- Quality). Strictly ADDITIVE on top of 20260803120000_brokerage_data.sql.
-- Turns the relational brokerage data into structured, explainable, trusted
-- knowledge: a graph layer, data-completeness, duplicate clusters, org
-- hierarchy, market share, data-health, refresh diffs, coverage, timeline and
-- AI relationship discovery. National/shared data, owner-vs-city access model.
-- Nothing here removes or alters existing functionality. Writes are service-role.
-- ============================================================================

-- ── Office hierarchy (extend brokerage_offices, additive) ───────────────────
alter table public.brokerage_offices add column if not exists parent_office_id uuid references public.brokerage_offices(id) on delete set null;
alter table public.brokerage_offices add column if not exists hierarchy_level text not null default 'independent'; -- independent | branch | regional | franchise | national_network
create index if not exists bo_parent_idx on public.brokerage_offices (parent_office_id);
create index if not exists bo_hier_idx   on public.brokerage_offices (hierarchy_level);

-- ── 1) Knowledge graph: nodes ───────────────────────────────────────────────
create table if not exists public.brokerage_graph_nodes (
  id           uuid primary key default gen_random_uuid(),
  node_type    text not null,            -- office|agent|phone|email|website|facebook|instagram|linkedin|city|neighborhood|street|listing|project|developer|property|transaction|organization|refresh_run|source
  node_key     text not null,            -- stable identity: "office:<uuid>" / "phone:<normalized>" / "city:<normcity>"
  label        text,
  entity_id    uuid,                     -- set for row-backed nodes (office/agent/listing…)
  value        text,                     -- set for value nodes (phone/email/city…)
  city         text,
  degree       integer not null default 0,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (node_key)
);
create index if not exists bgn_type_idx on public.brokerage_graph_nodes (node_type);
create index if not exists bgn_ent_idx  on public.brokerage_graph_nodes (entity_id);
create index if not exists bgn_city_idx on public.brokerage_graph_nodes (city);

-- ── 2) Knowledge graph: edges ───────────────────────────────────────────────
create table if not exists public.brokerage_graph_edges (
  id           uuid primary key default gen_random_uuid(),
  src_node_id  uuid not null references public.brokerage_graph_nodes(id) on delete cascade,
  dst_node_id  uuid not null references public.brokerage_graph_nodes(id) on delete cascade,
  edge_type    text not null,            -- WORKS_FOR|ACTIVE_IN|PUBLISHED_BY|BELONGS_TO|USED_PHONE|HAS_WEBSITE|FOUND_ON_SOURCE|MARKETED_BY|CHANGED_OFFICE|COMPETES_WITH|HAS_EMAIL|HAS_SOCIAL
  weight       numeric not null default 1,
  confidence   numeric not null default 0,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (src_node_id, dst_node_id, edge_type)
);
create index if not exists bge_src_idx  on public.brokerage_graph_edges (src_node_id);
create index if not exists bge_dst_idx  on public.brokerage_graph_edges (dst_node_id);
create index if not exists bge_type_idx on public.brokerage_graph_edges (edge_type);

-- ── 3) Data completeness ────────────────────────────────────────────────────
create table if not exists public.brokerage_completeness (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null,        -- office | agent
  entity_id        uuid not null,
  city             text,
  completeness_pct numeric not null default 0,
  filled_weight    numeric not null default 0,
  total_weight     numeric not null default 0,
  missing_fields   jsonb not null default '[]'::jsonb,
  suggestions      jsonb not null default '[]'::jsonb,
  sources_count    integer not null default 0,
  computed_at      timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index if not exists bcomp_pct_idx  on public.brokerage_completeness (completeness_pct);
create index if not exists bcomp_city_idx on public.brokerage_completeness (city);

-- ── 4) Duplicate clusters ───────────────────────────────────────────────────
create table if not exists public.brokerage_duplicate_clusters (
  id                 uuid primary key default gen_random_uuid(),
  entity_type        text not null,      -- office | agent
  city               text,
  cluster_confidence numeric not null default 0,
  master_entity_id   uuid,
  member_count       integer not null default 0,
  recommendation     text,               -- merge | review | keep_separate
  ai_explanation     text,
  status             text not null default 'open', -- open | merged | dismissed
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists bdcl_status_idx on public.brokerage_duplicate_clusters (status);
create index if not exists bdcl_city_idx   on public.brokerage_duplicate_clusters (city);

create table if not exists public.brokerage_duplicate_cluster_members (
  id          uuid primary key default gen_random_uuid(),
  cluster_id  uuid not null references public.brokerage_duplicate_clusters(id) on delete cascade,
  entity_id   uuid not null,
  similarity  numeric not null default 0,
  is_master   boolean not null default false,
  reasons     jsonb not null default '[]'::jsonb,
  unique (cluster_id, entity_id)
);
create index if not exists bdclm_cluster_idx on public.brokerage_duplicate_cluster_members (cluster_id);

-- ── 5) Market share snapshots ───────────────────────────────────────────────
create table if not exists public.brokerage_market_share (
  id                uuid primary key default gen_random_uuid(),
  scope_type        text not null,       -- network | office | agent | city | neighborhood
  scope_key         text not null,       -- identifier within scope_type
  scope_label       text,
  city              text,
  listings_count    integer not null default 0,
  activity_score    numeric not null default 0,
  cities_count      integer not null default 0,
  neighborhoods_count integer not null default 0,
  growth_score      numeric not null default 0,
  visibility_score  numeric not null default 0,
  sources_count     integer not null default 0,
  market_share_pct  numeric not null default 0,
  rank              integer,
  computed_at       timestamptz not null default now()
);
create index if not exists bms_scope_idx on public.brokerage_market_share (scope_type, market_share_pct desc);
create index if not exists bms_city_idx  on public.brokerage_market_share (city);

-- ── 6) Data-health snapshots ────────────────────────────────────────────────
create table if not exists public.brokerage_data_health_snapshots (
  id                uuid primary key default gen_random_uuid(),
  scope             text not null default 'global', -- global | city
  scope_key         text,                -- city when scope=city
  healthy           integer not null default 0,
  needs_review      integer not null default 0,
  missing_phones    integer not null default 0,
  missing_emails    integer not null default 0,
  low_confidence    integer not null default 0,
  duplicate_clusters integer not null default 0,
  inactive_offices  integer not null default 0,
  coverage_pct      numeric not null default 0,
  freshness_hours   numeric,
  metrics           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists bdh_created_idx on public.brokerage_data_health_snapshots (created_at desc);

-- ── 7) Refresh diffs (between runs) ─────────────────────────────────────────
create table if not exists public.brokerage_refresh_diffs (
  id                uuid primary key default gen_random_uuid(),
  refresh_run_id    uuid references public.brokerage_refresh_runs(id) on delete cascade,
  prev_run_id       uuid references public.brokerage_refresh_runs(id) on delete set null,
  new_offices       integer not null default 0,
  new_agents        integer not null default 0,
  updated_phones    integer not null default 0,
  updated_emails    integer not null default 0,
  merged_offices    integer not null default 0,
  resolved_conflicts integer not null default 0,
  inactive_offices  integer not null default 0,
  coverage_change   numeric not null default 0,
  market_share_change numeric not null default 0,
  growth            numeric not null default 0,
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists brd_run_idx on public.brokerage_refresh_diffs (refresh_run_id);

-- ── 8) Coverage analytics (per city) ────────────────────────────────────────
create table if not exists public.brokerage_coverage (
  id                uuid primary key default gen_random_uuid(),
  city              text not null,
  estimated_offices integer not null default 0,
  known_offices     integer not null default 0,
  coverage_pct      numeric not null default 0,
  known_agents      integer not null default 0,
  missing_offices   integer not null default 0,
  missing_agents    integer not null default 0,
  confidence        numeric not null default 0,
  computed_at       timestamptz not null default now(),
  unique (city)
);
create index if not exists bcov_city_idx on public.brokerage_coverage (city);

-- ── 9) Brokerage timeline (human-readable events) ───────────────────────────
create table if not exists public.brokerage_timeline_events (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,          -- office | agent
  entity_id      uuid not null,
  city           text,
  event_type     text not null,          -- created|verified|owner_changed|phone_added|website_updated|social_added|entered_city|stopped_activity|merged|conflict|resolved
  title          text not null,
  detail         text,
  source_id      uuid,
  refresh_run_id uuid references public.brokerage_refresh_runs(id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists btl_entity_idx  on public.brokerage_timeline_events (entity_type, entity_id);
create index if not exists btl_created_idx on public.brokerage_timeline_events (created_at desc);
create index if not exists btl_city_idx    on public.brokerage_timeline_events (city);

-- ── 10) Smart relationship discovery (AI recommendations) ───────────────────
create table if not exists public.brokerage_relationship_discoveries (
  id             uuid primary key default gen_random_uuid(),
  discovery_type text not null,          -- office_change|new_branch|merge|partnership|duplicate_agent|shared_office|brand_change
  entity_a_type  text,
  entity_a_id    uuid,
  entity_b_type  text,
  entity_b_id    uuid,
  city           text,
  confidence     numeric not null default 0,
  reasons        jsonb not null default '[]'::jsonb,
  ai_explanation text,
  status         text not null default 'pending', -- pending | accepted | dismissed
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid
);
create index if not exists brdisc_status_idx on public.brokerage_relationship_discoveries (status);
create index if not exists brdisc_type_idx   on public.brokerage_relationship_discoveries (discovery_type);

-- ============================================================================
-- RLS — owner sees everything; office/agent users see only city-scoped
-- knowledge derived from their allowed cities. Writes are service-role.
-- ============================================================================
alter table public.brokerage_graph_nodes              enable row level security;
alter table public.brokerage_graph_edges              enable row level security;
alter table public.brokerage_completeness             enable row level security;
alter table public.brokerage_duplicate_clusters       enable row level security;
alter table public.brokerage_duplicate_cluster_members enable row level security;
alter table public.brokerage_market_share             enable row level security;
alter table public.brokerage_data_health_snapshots    enable row level security;
alter table public.brokerage_refresh_diffs            enable row level security;
alter table public.brokerage_coverage                 enable row level security;
alter table public.brokerage_timeline_events          enable row level security;
alter table public.brokerage_relationship_discoveries enable row level security;

-- City-scoped reads (visible when the row's city is in the user's allowed set).
drop policy if exists bgn_select on public.brokerage_graph_nodes;
create policy bgn_select on public.brokerage_graph_nodes for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bcomp_select on public.brokerage_completeness;
create policy bcomp_select on public.brokerage_completeness for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bms_select on public.brokerage_market_share;
create policy bms_select on public.brokerage_market_share for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bcov_select on public.brokerage_coverage;
create policy bcov_select on public.brokerage_coverage for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists btl_select on public.brokerage_timeline_events;
create policy btl_select on public.brokerage_timeline_events for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists bdcl_select on public.brokerage_duplicate_clusters;
create policy bdcl_select on public.brokerage_duplicate_clusters for select to authenticated using (public.brokerage_city_visible(city));

drop policy if exists brdisc_select on public.brokerage_relationship_discoveries;
create policy brdisc_select on public.brokerage_relationship_discoveries for select to authenticated using (public.brokerage_city_visible(city));

-- Edges/members are visible when their source node / cluster is visible (or owner).
drop policy if exists bge_select on public.brokerage_graph_edges;
create policy bge_select on public.brokerage_graph_edges for select to authenticated
  using (public.is_zono_owner() or exists (select 1 from public.brokerage_graph_nodes n where n.id = src_node_id and public.brokerage_city_visible(n.city)));

drop policy if exists bdclm_select on public.brokerage_duplicate_cluster_members;
create policy bdclm_select on public.brokerage_duplicate_cluster_members for select to authenticated
  using (public.is_zono_owner() or exists (select 1 from public.brokerage_duplicate_clusters c where c.id = cluster_id and public.brokerage_city_visible(c.city)));

-- Owner-only system/audit tables.
drop policy if exists bdh_select on public.brokerage_data_health_snapshots;
create policy bdh_select on public.brokerage_data_health_snapshots for select to authenticated using (public.is_zono_owner());

drop policy if exists brd_select on public.brokerage_refresh_diffs;
create policy brd_select on public.brokerage_refresh_diffs for select to authenticated using (public.is_zono_owner());

-- Read grants (writes are service-role only, bypassing RLS).
grant select on
  public.brokerage_graph_nodes, public.brokerage_graph_edges, public.brokerage_completeness,
  public.brokerage_duplicate_clusters, public.brokerage_duplicate_cluster_members, public.brokerage_market_share,
  public.brokerage_data_health_snapshots, public.brokerage_refresh_diffs, public.brokerage_coverage,
  public.brokerage_timeline_events, public.brokerage_relationship_discoveries
to authenticated;
