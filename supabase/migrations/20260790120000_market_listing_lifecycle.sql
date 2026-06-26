-- ============================================================================
-- PHASE MAI-1 — Market Acceptance Intelligence™ FOUNDATION.
--
-- Observes the lifecycle of every external listing as EVIDENCE — it never
-- assumes a property was sold. Two tables:
--   • market_listing_lifecycle — one row per (org, provider, external_id),
--     the current observed state + last-known snapshot + counters.
--   • market_listing_events     — append-only, immutable timeline of every
--     observed lifecycle change.
--
-- NO market logic here (no Likely-Sold / Acceptance Score / valuation impact).
-- This migration only captures and preserves evidence. Org-scoped + RLS;
-- writes happen via the service role (the sync reconciler), reads by org members.
-- ============================================================================

-- ── Lifecycle (one row per external listing) ────────────────────────────────
create table if not exists public.market_listing_lifecycle (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  provider                 text not null,                 -- yad2 | madlan | ...
  external_id              text not null,                 -- provider listing id
  listing_url              text,
  first_seen_at            timestamptz not null default now(),
  last_seen_at             timestamptz not null default now(),
  last_scan_at             timestamptz not null default now(),
  current_state            text not null default 'ACTIVE',-- ACTIVE | DISAPPEARED | RETURNED | LIKELY_SOLD | LIKELY_REMOVED | UNKNOWN
  days_on_market           integer not null default 0,    -- observed elapsed days since first_seen_at (evidence, not a sale claim)
  times_seen               integer not null default 0,
  times_disappeared        integer not null default 0,
  times_returned           integer not null default 0,
  last_known_price         bigint,
  last_known_status        text,
  last_known_images        jsonb,
  last_known_coordinates   jsonb,                          -- { lat, lng } or null — real only
  last_known_address       text,
  last_known_city          text,
  last_known_neighborhood  text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create index if not exists mll_org_state_idx        on public.market_listing_lifecycle (organization_id, current_state);
create index if not exists mll_org_provider_ext_idx on public.market_listing_lifecycle (organization_id, provider, external_id);
create index if not exists mll_last_scan_idx         on public.market_listing_lifecycle (organization_id, last_scan_at);

-- ── Events (append-only, immutable timeline) ────────────────────────────────
create table if not exists public.market_listing_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  lifecycle_id     uuid references public.market_listing_lifecycle(id) on delete cascade,
  provider         text not null,
  external_id      text not null,
  event_type       text not null,   -- FIRST_SEEN | PRICE_CHANGED | IMAGE_CHANGED | DESCRIPTION_CHANGED | STATUS_CHANGED | DISAPPEARED | RETURNED | REAPPEARED_WITH_NEW_ID | LIKELY_DUPLICATE | MANUAL_OVERRIDE
  previous_value   jsonb,
  new_value        jsonb,
  confidence       numeric not null default 1.0,  -- 1.0 = directly observed; <1 reserved for inferred events (later phases)
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists mle_org_provider_ext_idx on public.market_listing_events (organization_id, provider, external_id, created_at);
create index if not exists mle_lifecycle_idx          on public.market_listing_events (lifecycle_id, created_at);
create index if not exists mle_event_type_idx         on public.market_listing_events (organization_id, event_type, created_at);

-- ── RLS — org members READ their own data; writes are service-role only ─────
alter table public.market_listing_lifecycle enable row level security;
alter table public.market_listing_events    enable row level security;

drop policy if exists mll_select on public.market_listing_lifecycle;
create policy mll_select on public.market_listing_lifecycle
  for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists mle_select on public.market_listing_events;
create policy mle_select on public.market_listing_events
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.market_listing_lifecycle to authenticated;
grant select on public.market_listing_events    to authenticated;
