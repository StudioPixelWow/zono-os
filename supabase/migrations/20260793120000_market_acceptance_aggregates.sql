-- ============================================================================
-- PHASE MAI-4 — Market Acceptance Aggregates Engine.
--
-- Rolls listing-level Market Acceptance Intelligence (MAI-1 lifecycle, MAI-2
-- signals, MAI-3 confidence) up into MARKET-level metrics by org / city /
-- neighborhood / property_type / rooms / price bucket, across 7/14/30/60/90-day
-- windows. EVIDENCE-based and cautious — small samples are flagged, never
-- overstated. NEVER claims an official sale (LIKELY_ACCEPTED ≠ sold). No
-- valuation / heatmap / decision-brain / UI wiring in this phase.
-- ============================================================================
create table if not exists public.market_acceptance_aggregates (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  city                        text,
  neighborhood                text,
  property_type               text,
  rooms                       numeric,
  price_bucket                text,
  window_days                 integer not null,
  window_start                timestamptz not null,
  window_end                  timestamptz not null,
  active_count                integer not null default 0,
  disappeared_count           integer not null default 0,
  likely_exit_count           integer not null default 0,
  likely_accepted_count       integer not null default 0,
  likely_rejected_count       integer not null default 0,
  uncertain_count             integer not null default 0,
  returned_count              integer not null default 0,
  median_days_on_market       numeric,
  avg_days_on_market          numeric,
  avg_last_known_price        numeric,
  median_last_known_price     numeric,
  avg_price_reduction_pct     numeric,
  median_price_reduction_pct  numeric,
  market_exit_rate            numeric,
  market_acceptance_rate      numeric,
  market_rejection_rate       numeric,
  absorption_speed_score      numeric,
  sample_size                 integer not null default 0,
  confidence                  numeric not null default 0,
  evidence                    jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- NULLS NOT DISTINCT (PG15+) so coarse segments (NULL neighborhood/type/rooms/
-- bucket) dedupe correctly on upsert; otherwise every sync would duplicate them.
create unique index if not exists maa_segment_window_uidx
  on public.market_acceptance_aggregates (
    organization_id, city, neighborhood, property_type, rooms, price_bucket, window_days, window_end
  ) nulls not distinct;

create index if not exists maa_org_window_idx on public.market_acceptance_aggregates (organization_id, window_days, window_end);
create index if not exists maa_org_city_idx   on public.market_acceptance_aggregates (organization_id, city, window_days);

alter table public.market_acceptance_aggregates enable row level security;

drop policy if exists maa_select on public.market_acceptance_aggregates;
create policy maa_select on public.market_acceptance_aggregates
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_acceptance_aggregates to authenticated;
