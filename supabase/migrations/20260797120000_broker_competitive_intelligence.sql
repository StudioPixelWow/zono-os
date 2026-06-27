-- ============================================================================
-- PHASE MAI-8 — Broker Competitive Intelligence™.
--
-- Explains WHY brokers perform differently. For every broker × market segment ×
-- window it compares the broker's OBSERVED market behaviour against the area
-- leader, the area average, and the runner-up, and records the observed
-- competitive position, behavioural deltas, and evidence-based strengths /
-- weaknesses / opportunities / risks + best/worst segment discovery.
--
-- It does NOT rank brokers and NEVER claims "this broker is better". No AI, no
-- recommendations, no official-sale claims, no fake values — deterministic and
-- explainable. Org-scoped + RLS read; writes via the service role. No UI.
-- ============================================================================
create table if not exists public.broker_competitive_intelligence (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  broker_id                   uuid not null references public.broker_profiles(id) on delete cascade,
  city                        text,
  neighborhood                text,
  property_type               text,
  rooms                       numeric,
  price_bucket                text,
  window_days                 integer not null,
  calculated_at               timestamptz not null default now(),
  model_version               text not null default 'mai-8.0',

  -- ── Competitive position vs leader / average / runner-up ──────────────────
  market_position             text,        -- LEADER | RUNNER_UP | CONTENDER | TRAILING | SOLE | INSUFFICIENT
  leader_gap                  numeric,     -- leader dominance − this broker's dominance
  market_share                numeric,     -- fraction 0..1 of area active listings
  market_growth               numeric,     -- positive momentum (recent vs long-run)
  market_decline              numeric,     -- magnitude of negative momentum

  -- ── Behavioural deltas (vs area average / area median) ────────────────────
  activity_delta              numeric,
  performance_delta           numeric,
  success_delta               numeric,
  exit_speed_delta            numeric,     -- >0 = faster than the area median
  listing_share_delta         numeric,     -- vs an equal share of the area

  -- ── Observed competitive intelligence (evidence-based, never advice) ──────
  competitive_strengths       jsonb not null default '[]'::jsonb,
  competitive_weaknesses      jsonb not null default '[]'::jsonb,
  competitive_opportunities   jsonb not null default '[]'::jsonb,
  competitive_risks           jsonb not null default '[]'::jsonb,

  -- ── Segment discovery (broker-level, per window) ──────────────────────────
  strongest_segment           text,
  weakest_segment             text,
  best_property_type          text,
  best_price_bucket           text,
  best_neighborhood           text,

  sample_size                 integer not null default 0,
  confidence                  numeric not null default 0,
  evidence                    jsonb not null default '[]'::jsonb,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- One row per broker × segment × window (re-runs upsert in place).
-- NULLS NOT DISTINCT (PG15+) so coarse segments dedupe correctly on upsert.
create unique index if not exists bci_broker_segment_window_uidx
  on public.broker_competitive_intelligence (
    organization_id, broker_id, city, neighborhood, property_type, rooms, price_bucket, window_days
  ) nulls not distinct;

create index if not exists bci_org_broker_idx   on public.broker_competitive_intelligence (organization_id, broker_id);
create index if not exists bci_org_window_idx    on public.broker_competitive_intelligence (organization_id, window_days);
create index if not exists bci_org_city_idx      on public.broker_competitive_intelligence (organization_id, city, window_days);
create index if not exists bci_org_position_idx  on public.broker_competitive_intelligence (organization_id, market_position);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.broker_competitive_intelligence enable row level security;

drop policy if exists bci_select on public.broker_competitive_intelligence;
create policy bci_select on public.broker_competitive_intelligence
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.broker_competitive_intelligence to authenticated;
