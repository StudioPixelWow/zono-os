-- ============================================================================
-- ZONO — National Brokerage Registry & AI Candidate Discovery™ (Phase 26.11).
-- STRICTLY ADDITIVE. Extends Phase 26.10.
-- ----------------------------------------------------------------------------
-- A structured CANDIDATE registry of brokerage offices (by city / area / brand),
-- separate from the VERIFIED brokerage_offices table. AI may SUGGEST candidates
-- but can never mark them verified — verification is evidence-based and only then
-- is a brokerage_offices row created/updated. No fake verified offices; no broker
-- assignment without evidence.
--
-- Adds:
--   1) brokerage_office_candidates  — the national candidate registry.
--   2) brokerage_office_merge_suggestions — pending duplicate merges (no auto-merge).
--   3) brokerage_office_graph_edges — evidence-based office/broker edges
--      (distinct from the protected BKG brokerage_graph_edges table).
--   4) registry metric columns on brokerage_office_discovery_runs (additive).
-- Reuses existing RLS helpers (is_zono_owner / brokerage_city_visible).
-- ============================================================================

-- ── 1) Office candidate registry ─────────────────────────────────────────────
create table if not exists public.brokerage_office_candidates (
  id                   uuid primary key default gen_random_uuid(),
  office_name          text not null,
  normalized_name      text,
  brand_network        text,            -- RE/MAX | Anglo Saxon | Century 21 | Keller Williams | ERA | HomeLand | independent | ...
  normalized_brand     text,
  office_branch_name   text,            -- e.g. "סניף הרצליה"
  city                 text,
  area                 text,            -- neighborhood when known
  phone                text,            -- OBSERVED only — never invented
  email                text,
  website              text,
  domain               text,
  suggested_by         text not null default 'zono_listings',   -- zono_listings | known_brands | public_source | ai | manual
  confidence           numeric not null default 0,
  status               text not null default 'candidate_pending_verification',  -- candidate_pending_verification | verified | rejected | needs_review
  evidence             jsonb not null default '[]'::jsonb,
  verification_sources jsonb not null default '[]'::jsonb,
  verified_office_id   uuid references public.brokerage_offices(id) on delete set null,
  metadata             jsonb not null default '{}'::jsonb,
  first_seen_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists boc_city_idx   on public.brokerage_office_candidates (city);
create index if not exists boc_brand_idx   on public.brokerage_office_candidates (brand_network);
create index if not exists boc_status_idx  on public.brokerage_office_candidates (status);
create index if not exists boc_norm_idx    on public.brokerage_office_candidates (normalized_name);
-- Dedupe a candidate by (normalized brand + normalized name + city).
create unique index if not exists boc_dedupe_idx on public.brokerage_office_candidates
  (coalesce(normalized_brand,''), coalesce(normalized_name,''), coalesce(city,''));

-- ── 2) Merge suggestions (no auto-merge below very high confidence) ───────────
create table if not exists public.brokerage_office_merge_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  primary_office_id    uuid references public.brokerage_offices(id) on delete cascade,
  duplicate_office_id  uuid references public.brokerage_offices(id) on delete cascade,
  primary_candidate_id uuid references public.brokerage_office_candidates(id) on delete cascade,
  duplicate_candidate_id uuid references public.brokerage_office_candidates(id) on delete cascade,
  reason               text not null,
  confidence           numeric not null default 0,
  status               text not null default 'pending',  -- pending | merged | rejected
  evidence             jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists boms_status_idx on public.brokerage_office_merge_suggestions (status);

-- ── 3) Evidence-based office graph edges (additive; NOT the protected BKG
--     brokerage_graph_edges table — distinct name to avoid any collision). ─────
create table if not exists public.brokerage_office_graph_edges (
  id           uuid primary key default gen_random_uuid(),
  edge_type    text not null,   -- office_broker | office_city | office_neighborhood | office_brand | broker_office | broker_city | broker_listing | office_listing
  source_type  text not null,
  source_id    text not null,
  target_type  text not null,
  target_id    text not null,
  label        text,
  weight       numeric not null default 1,
  evidence     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists boge_unique_idx on public.brokerage_office_graph_edges (edge_type, source_id, target_id);
create index if not exists boge_source_idx on public.brokerage_office_graph_edges (source_type, source_id);
create index if not exists boge_target_idx on public.brokerage_office_graph_edges (target_type, target_id);

-- ── 4) Registry metrics on the discovery run log (additive columns) ───────────
alter table public.brokerage_office_discovery_runs
  add column if not exists cities_processed       integer not null default 0,
  add column if not exists candidates_created     integer not null default 0,
  add column if not exists candidates_verified    integer not null default 0,
  add column if not exists duplicate_candidates   integer not null default 0,
  add column if not exists ai_candidates_created  integer not null default 0,
  add column if not exists ai_candidates_verified integer not null default 0,
  add column if not exists public_sources_skipped integer not null default 0;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.brokerage_office_candidates       enable row level security;
alter table public.brokerage_office_merge_suggestions enable row level security;
alter table public.brokerage_office_graph_edges      enable row level security;

drop policy if exists boc_select on public.brokerage_office_candidates;
create policy boc_select on public.brokerage_office_candidates for select to authenticated
  using (public.is_zono_owner() or public.brokerage_city_visible(city));

drop policy if exists boms_select on public.brokerage_office_merge_suggestions;
create policy boms_select on public.brokerage_office_merge_suggestions for select to authenticated
  using (public.is_zono_owner());

drop policy if exists boge_select on public.brokerage_office_graph_edges;
create policy boge_select on public.brokerage_office_graph_edges for select to authenticated
  using (public.is_zono_owner());

grant select on public.brokerage_office_candidates, public.brokerage_office_merge_suggestions, public.brokerage_office_graph_edges to authenticated;
grant all on public.brokerage_office_candidates, public.brokerage_office_merge_suggestions, public.brokerage_office_graph_edges to service_role;
