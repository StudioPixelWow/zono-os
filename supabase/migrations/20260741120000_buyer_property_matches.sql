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
