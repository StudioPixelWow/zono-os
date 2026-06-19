-- ============================================================================
-- ZONO — 0024 · Real Market Heatmap + Pricing Intelligence OS
-- ----------------------------------------------------------------------------
-- Daily locality-level market snapshots. Org-scoped. Aggregated from
-- external_listings, properties, buyers, match_intelligence_profiles,
-- entity_relationships, external_listing_history/duplicates. No new providers.
-- ============================================================================

create table public.market_area_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  locality_id                 uuid references public.israel_localities(id) on delete set null,
  locality_name               text not null,
  date                        date not null default current_date,
  active_external_listings    integer not null default 0,
  active_internal_properties  integer not null default 0,
  avg_price                   bigint,
  avg_price_per_sqm           integer,
  median_price                bigint,
  min_price                   bigint,
  max_price                   bigint,
  avg_rooms                   numeric(3,1),
  price_drops_count           integer not null default 0,
  below_average_count         integer not null default 0,
  private_owner_count         integer not null default 0,
  duplicate_candidates_count  integer not null default 0,
  active_buyers_count         integer not null default 0,
  matched_buyers_count        integer not null default 0,
  demand_score                smallint not null default 0,
  supply_score                smallint not null default 0,
  opportunity_score           smallint not null default 0,
  heat_level                  text not null default 'cool',
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint market_area_snapshots_uniq unique (organization_id, locality_name, date)
);

create index market_area_snapshots_org_idx       on public.market_area_snapshots(organization_id);
create index market_area_snapshots_locality_idx   on public.market_area_snapshots(locality_id);
create index market_area_snapshots_date_idx        on public.market_area_snapshots(date desc);
create index market_area_snapshots_org_date_idx    on public.market_area_snapshots(organization_id, date desc);

create trigger trg_market_area_snapshots_updated before update on public.market_area_snapshots
  for each row execute function public.set_updated_at();

-- RLS — org-scoped
alter table public.market_area_snapshots enable row level security;
create policy "market_area_snapshots_select" on public.market_area_snapshots
  for select to authenticated using (organization_id = public.current_org_id());
create policy "market_area_snapshots_insert" on public.market_area_snapshots
  for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role('agent'));
create policy "market_area_snapshots_update" on public.market_area_snapshots
  for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id());
create policy "market_area_snapshots_delete" on public.market_area_snapshots
  for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role('manager'));

grant select, insert, update, delete on public.market_area_snapshots to authenticated;
grant all privileges on public.market_area_snapshots to service_role;
