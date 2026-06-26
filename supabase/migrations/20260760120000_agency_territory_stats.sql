-- ============================================================================
-- ZONO — PHASE 26.4: Agency Territory Dominance Engine™
-- ----------------------------------------------------------------------------
-- Per-agency, per-territory (city / neighborhood / street) dominance + momentum
-- statistics, derived from the Agency Knowledge Graph (26.3) + real internal
-- data. Additive + idempotent. No UI, no external scraping, no mock data.
-- Org column: organization_id. RLS via current_org_id() + has_min_role().
--
-- Idempotency: a stat row is identified by
--   (organization_id, agency_id, territory_type, territory_key, period_days)
-- where territory_key is the normalized city/neighborhood/street path. Re-runs
-- for the same window upsert in place (calculated_at refreshed). Missing data is
-- stored as NULL — never a fabricated 0.
-- ============================================================================

create table if not exists public.agency_territory_stats (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  agency_id                uuid not null references public.agencies(id) on delete cascade,
  territory_type           text not null,   -- city | neighborhood | street
  city                     text,
  neighborhood             text,
  street                   text,
  territory_key            text not null,   -- normalized path used for idempotency + lookups
  period_start             timestamptz,
  period_end               timestamptz,
  period_days              integer not null default 90,  -- 7 | 30 | 90 | 180 | 365
  -- raw counts (observed integers — 0 is a real count, not "missing")
  active_listings_count    integer not null default 0,
  historical_listings_count integer not null default 0,
  sold_count               integer not null default 0,
  deals_count              integer not null default 0,
  exclusive_count          integer not null default 0,
  price_drop_count         integer,         -- null when no price-history data
  -- averages / shares / velocities (NULL when not computable — never fake 0)
  avg_price                numeric,
  avg_price_per_sqm        numeric,
  avg_days_on_market       numeric,
  listing_velocity         numeric,
  sales_velocity           numeric,
  inventory_share          numeric,         -- 0..1
  sales_share              numeric,         -- 0..1
  luxury_share             numeric,         -- 0..1
  -- scores
  dominance_score          numeric,         -- 0..100
  momentum_score           numeric,         -- 0..100
  trend                    text,            -- growing | stable | declining | unknown
  confidence               numeric,         -- 0..1
  metadata                 jsonb not null default '{}'::jsonb,
  calculated_at            timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, agency_id, territory_type, territory_key, period_days)
);

create index if not exists agency_terr_org_idx        on public.agency_territory_stats(organization_id);
create index if not exists agency_terr_agency_idx      on public.agency_territory_stats(agency_id);
create index if not exists agency_terr_type_idx        on public.agency_territory_stats(territory_type);
create index if not exists agency_terr_key_idx         on public.agency_territory_stats(territory_key);
create index if not exists agency_terr_city_idx        on public.agency_territory_stats(organization_id, city);
create index if not exists agency_terr_lookup_idx      on public.agency_territory_stats(organization_id, territory_type, territory_key, period_days);
create index if not exists agency_terr_dominance_idx   on public.agency_territory_stats(organization_id, territory_key, period_days, dominance_score desc);

-- ── updated_at trigger ───────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at')
     and not exists (select 1 from pg_trigger where tgname = 'trg_agency_territory_stats_updated') then
    execute 'create trigger trg_agency_territory_stats_updated before update on public.agency_territory_stats for each row execute function public.set_updated_at();';
  end if;
end $$;

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.agency_territory_stats enable row level security;';

  execute 'drop policy if exists agency_territory_stats_select on public.agency_territory_stats;';
  execute 'create policy agency_territory_stats_select on public.agency_territory_stats for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists agency_territory_stats_insert on public.agency_territory_stats;';
  execute 'create policy agency_territory_stats_insert on public.agency_territory_stats for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_territory_stats_update on public.agency_territory_stats;';
  execute 'create policy agency_territory_stats_update on public.agency_territory_stats for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_territory_stats_delete on public.agency_territory_stats;';
  execute 'create policy agency_territory_stats_delete on public.agency_territory_stats for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.agency_territory_stats to authenticated;';
  execute 'grant all privileges on public.agency_territory_stats to service_role;';
end $$;
