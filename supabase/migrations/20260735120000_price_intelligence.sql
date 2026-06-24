-- ============================================================================
-- ZONO — Price Intelligence (Phase 26, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Premium AI property valuation for brokers. Stores valuation inputs + results,
-- the comparables/listings/broker-sold evidence behind each valuation, the
-- value adjustments, a market snapshot, the generated seller-facing report and
-- its send events (WhatsApp / Email).
--
-- HARD RULES: every stored number is derived from real inputs or real evidence
-- rows. Provider/source is always recorded on comparables so demo/stub data is
-- distinguishable from official data. NOTHING here invents official records.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── property_valuations — one valuation (draft → computed) ───────────────────
create table if not exists public.property_valuations (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  property_id                 uuid references public.properties(id) on delete set null,
  created_by                  uuid not null,
  status                      text not null default 'draft', -- draft | computing | completed | failed
  -- location
  city                        text,
  neighborhood                text,
  street                      text,
  house_number                text,
  apartment_number            text,
  latitude                    numeric,
  longitude                   numeric,
  -- property details
  property_type               text,
  rooms                       numeric,
  built_sqm                   numeric,
  balcony_sqm                 numeric,
  garden_sqm                  numeric,
  floor                       numeric,
  total_floors                numeric,
  elevator                    boolean,
  parking_count               integer,
  storage                     boolean,
  mamad                       boolean,
  renovated                   boolean,
  property_condition          text,
  view_quality                text,
  noise_level                 text,
  building_year               integer,
  notes                       text,
  -- results
  estimated_value             numeric,
  low_value                   numeric,
  high_value                  numeric,
  recommended_listing_price   numeric,
  target_closing_price        numeric,
  minimum_acceptable_price    numeric,
  estimated_price_per_sqm     numeric,
  confidence_score            numeric,
  confidence_level            text,      -- high | medium | low
  demand_score                numeric,
  liquidity_score             numeric,
  overpricing_risk_score      numeric,
  days_on_market_estimate     integer,
  explanation                 text,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists property_valuations_org_idx on public.property_valuations(organization_id);
create index if not exists property_valuations_property_idx on public.property_valuations(property_id);
create index if not exists property_valuations_created_idx on public.property_valuations(organization_id, created_at desc);

-- ── valuation_comparables — sold transactions + active listings evidence ─────
create table if not exists public.valuation_comparables (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  valuation_id        uuid not null references public.property_valuations(id) on delete cascade,
  source              text,            -- govmap | tax_authority | madlan | yad2 | zono
  comparable_type     text,            -- sold | listing
  external_id         text,
  city                text,
  neighborhood        text,
  street              text,
  distance_meters     numeric,
  property_type       text,
  rooms               numeric,
  sqm                 numeric,
  floor               numeric,
  building_year       integer,
  price               numeric,
  price_per_sqm       numeric,
  sale_date           date,
  listing_date        date,
  similarity_score    numeric,
  adjustment_score    numeric,
  adjustment_reason   text,
  image_url           text,
  is_demo             boolean not null default false, -- clearly mark demo data
  raw_payload         jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists valuation_comparables_val_idx on public.valuation_comparables(valuation_id);
create index if not exists valuation_comparables_org_idx on public.valuation_comparables(organization_id);

-- ── valuation_broker_sold_properties — broker's own nearby sales ─────────────
create table if not exists public.valuation_broker_sold_properties (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  valuation_id                  uuid not null references public.property_valuations(id) on delete cascade,
  property_id                   uuid references public.properties(id) on delete set null,
  deal_id                       uuid,
  address                       text,
  city                          text,
  neighborhood                  text,
  street                        text,
  sale_price                    numeric,
  price_per_sqm                 numeric,
  sale_date                     date,
  rooms                         numeric,
  sqm                           numeric,
  distance_meters               numeric,
  agent_id                      uuid,
  buyer_type                    text,
  image_url                     text,
  performance_vs_market_percent numeric,
  created_at                    timestamptz not null default now()
);
create index if not exists valuation_broker_sold_val_idx on public.valuation_broker_sold_properties(valuation_id);
create index if not exists valuation_broker_sold_org_idx on public.valuation_broker_sold_properties(organization_id);

-- ── valuation_adjustments — explainable value drivers (+/-) ──────────────────
create table if not exists public.valuation_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  valuation_id        uuid not null references public.property_valuations(id) on delete cascade,
  label               text,
  direction           text,            -- positive | negative
  value_impact        numeric,
  percentage_impact   numeric,
  reason              text,
  confidence          numeric,
  created_at          timestamptz not null default now()
);
create index if not exists valuation_adjustments_val_idx on public.valuation_adjustments(valuation_id);

-- ── valuation_market_snapshots — neighborhood market pulse at valuation time ─
create table if not exists public.valuation_market_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  valuation_id                uuid not null references public.property_valuations(id) on delete cascade,
  avg_price_per_sqm           numeric,
  median_price_per_sqm        numeric,
  transaction_count           integer,
  active_listing_count        integer,
  demand_level                text,
  supply_level                text,
  trend_direction             text,
  trend_percent               numeric,
  listing_to_sold_gap_percent numeric,
  data_quality_score          numeric,
  raw_payload                 jsonb,
  created_at                  timestamptz not null default now()
);
create index if not exists valuation_market_snap_val_idx on public.valuation_market_snapshots(valuation_id);

-- ── valuation_reports — generated seller-facing PDF/HTML report ──────────────
create table if not exists public.valuation_reports (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  valuation_id        uuid not null references public.property_valuations(id) on delete cascade,
  report_type         text not null default 'seller_pdf',
  status              text not null default 'generated',
  public_token        text unique,
  pdf_url             text,
  html_snapshot       text,
  report_payload      jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists valuation_reports_val_idx on public.valuation_reports(valuation_id);
create index if not exists valuation_reports_token_idx on public.valuation_reports(public_token);

-- ── valuation_report_sends — WhatsApp / Email send events ────────────────────
create table if not exists public.valuation_report_sends (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  valuation_id        uuid not null references public.property_valuations(id) on delete cascade,
  report_id           uuid not null references public.valuation_reports(id) on delete cascade,
  channel             text,            -- whatsapp | email
  recipient_name      text,
  recipient_phone     text,
  recipient_email     text,
  message             text,
  status              text not null default 'prepared', -- prepared | sent | failed
  sent_at             timestamptz,
  opened_at           timestamptz,
  metadata            jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists valuation_report_sends_val_idx on public.valuation_report_sends(valuation_id);
create index if not exists valuation_report_sends_report_idx on public.valuation_report_sends(report_id);

-- ── updated_at triggers (only the tables that carry updated_at) ──────────────
drop trigger if exists trg_property_valuations_updated on public.property_valuations;
create trigger trg_property_valuations_updated before update on public.property_valuations for each row execute function public.set_updated_at();

-- ── RLS — same-org read; agent+ write ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'property_valuations','valuation_comparables','valuation_broker_sold_properties',
    'valuation_adjustments','valuation_market_snapshots','valuation_reports','valuation_report_sends'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role('agent')) with check (organization_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;

-- ── Public report read — a generated report is viewable by its public_token ──
-- The seller-facing page reads the report via service_role (server-side) using
-- the token, so no anonymous RLS policy is opened on these tables.
