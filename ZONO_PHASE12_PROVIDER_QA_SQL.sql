-- ============================================================================
-- ZONO Property Radar™ — Phase 12: Production Provider QA & Data Integrity.
-- ----------------------------------------------------------------------------
-- Three SHARED system tables (no org_id, service-role only) that back the
-- provider QA layer: detected provider-schema changes, a rolling field-type
-- fingerprint per provider (to detect those changes), and daily per-provider
-- quality/latency/completeness metrics. Additive + idempotent. Does NOT touch
-- any existing table or RLS.
-- ============================================================================

-- ── A. provider_schema_events — schema drift + QA degradation log ────────────
create table if not exists public.provider_schema_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,
  field          text not null,
  previous_type  text,
  new_type       text,
  -- low / medium / high / urgent
  severity       text not null default 'medium',
  detected_at    timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists pse_provider_idx    on public.provider_schema_events(provider);
create index if not exists pse_severity_idx     on public.provider_schema_events(severity);
create index if not exists pse_detected_at_idx  on public.provider_schema_events(detected_at);

-- ── B. provider_schema_fingerprints — last-seen field types per provider ─────
create table if not exists public.provider_schema_fingerprints (
  provider     text primary key,
  fields       jsonb not null default '{}'::jsonb, -- { fieldName: "string|number|boolean|object|array|null" }
  sample_count int not null default 0,
  updated_at   timestamptz not null default now()
);

-- ── C. provider_qa_daily_metrics — one row per provider per day ──────────────
create table if not exists public.provider_qa_daily_metrics (
  id                        uuid primary key default gen_random_uuid(),
  provider                  text not null,
  day                       date not null default current_date,
  listings_scanned          int not null default 0,
  listings_rejected         int not null default 0,
  normalization_errors      int not null default 0,
  avg_fields_completeness   numeric not null default 0, -- 0..100
  avg_quality_score         numeric not null default 0, -- 0..100
  avg_latency_ms            numeric not null default 0,
  missing_phones            int not null default 0,
  missing_images            int not null default 0,
  duplicate_count           int not null default 0,
  duplicate_rate            numeric not null default 0, -- 0..100
  schema_warnings           int not null default 0,
  credits_used              int not null default 0,
  credits_saved             int not null default 0,
  -- ok / warning / degraded
  status                    text not null default 'ok',
  updated_at                timestamptz not null default now(),
  unique (provider, day)
);
create index if not exists pqdm_provider_idx on public.provider_qa_daily_metrics(provider);
create index if not exists pqdm_day_idx       on public.provider_qa_daily_metrics(day);

drop trigger if exists trg_provider_schema_fingerprints_updated on public.provider_schema_fingerprints;
create trigger trg_provider_schema_fingerprints_updated
  before update on public.provider_schema_fingerprints
  for each row execute function public.set_updated_at();

drop trigger if exists trg_provider_qa_daily_metrics_updated on public.provider_qa_daily_metrics;
create trigger trg_provider_qa_daily_metrics_updated
  before update on public.provider_qa_daily_metrics
  for each row execute function public.set_updated_at();

-- ── RLS: shared system tables — service role only, never authenticated ───────
do $$
declare t text;
begin
  foreach t in array array['provider_schema_events','provider_schema_fingerprints','provider_qa_daily_metrics'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
