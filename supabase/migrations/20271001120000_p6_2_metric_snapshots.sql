-- ============================================================================
-- ZONO — P6.2 Historical Metrics · OPTIONAL daily-snapshot table.
-- STATUS: PROPOSED — NOT APPLIED, and NOT REQUIRED for P6.2.
--
-- P6.2 trends are computed at READ TIME by aggregating existing timestamps
-- (domain_events.occurred_at, *.created_at, payments, ai_usage_costs) — so NO
-- migration is needed for the delivered trend views. This table is the SCALING
-- PATH only: when read-time aggregation over 90 days of raw events becomes too
-- expensive, or when POINT-IN-TIME "state at end of day" metrics are needed
-- (which cannot be reconstructed from created_at alone), a daily job writes one
-- idempotent snapshot row per (date, org, metric, dimension).
--
-- Additive: NEW table only. No changes to existing tables/columns/RLS/data.
-- Apply ONLY if/when the scaling or point-in-time need is confirmed.
-- ============================================================================

create table if not exists public.platform_metric_snapshots (
  id              uuid primary key default gen_random_uuid(),
  metric_date     date not null,                       -- Israel-calendar day (Asia/Jerusalem)
  organization_id uuid references public.organizations(id) on delete cascade, -- null = platform-wide
  metric_key      text not null,                       -- e.g. dau, active_orgs_daily, leads_created_daily
  dimension_key   text,                                -- e.g. module='property', provider='openai' (nullable)
  value           numeric(20,4) not null default 0,
  source          text not null default 'aggregation', -- aggregation | backfill
  created_at      timestamptz not null default now(),
  -- one canonical snapshot per date/org/metric/dimension (idempotent upserts)
  constraint platform_metric_snapshots_uniq
    unique (metric_date, organization_id, metric_key, dimension_key)
);

create index if not exists pms_metric_date_idx on public.platform_metric_snapshots (metric_key, metric_date desc);
create index if not exists pms_org_date_idx    on public.platform_metric_snapshots (organization_id, metric_date desc);

-- RLS: platform service-role DAL only (mirrors support_tickets / ai_usage_costs).
alter table public.platform_metric_snapshots enable row level security;
revoke all on public.platform_metric_snapshots from anon, authenticated;

-- Expected row growth: ~ (#metrics × #orgs × 1/day) + platform-wide rows.
-- At a few dozen metrics and low org counts this is tens of rows/day — trivial.
-- Backfill rows (source='backfill') are written ONLY with explicit approval.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.platform_metric_snapshots;
