-- ============================================================================
-- ZONO — PHASE 26.3: Agency Knowledge Graph™
-- ----------------------------------------------------------------------------
-- Connects every agency to the existing ZONO business entities (agents,
-- properties, sellers, buyers, deals, cities, neighborhoods, streets, projects,
-- developers, activity events) through a single, typed, org-scoped relationship
-- table. Additive + idempotent. No UI, no external scraping, no mock data.
-- Org column: organization_id. RLS via current_org_id() + has_min_role().
--
-- A relationship is uniquely identified by
--   (organization_id, agency_id, entity_type, entity_id, relationship_type)
-- so the graph builder can re-run safely (upsert): existing rows have their
-- confidence / evidence / last_seen_at refreshed; rows no longer detected are
-- soft-deactivated (active = false) — history is never destroyed.
-- ============================================================================

create table if not exists public.agency_entity_relationships (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  entity_type       text not null,   -- agent|property|seller|buyer|deal|city|neighborhood|street|project|developer|activity|listing
  entity_id         text not null,   -- uuid for internal entities; normalized key for areas (city/neighborhood/street) & external names
  relationship_type text not null,   -- agent_member|property_listing|property_sold|seller_contact|buyer_contact|deal_participant|developer_partner|project_marketer|area_activity|digital_presence|source_provider
  confidence        numeric not null default 0.5,   -- 0..1
  source            text,            -- internal_agents|internal_properties|internal_deals|external_listings|broker_match|projects ...
  evidence          jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, agency_id, entity_type, entity_id, relationship_type)
);

create index if not exists agency_rel_org_idx          on public.agency_entity_relationships(organization_id);
create index if not exists agency_rel_agency_idx        on public.agency_entity_relationships(agency_id);
create index if not exists agency_rel_entity_type_idx   on public.agency_entity_relationships(entity_type);
create index if not exists agency_rel_entity_id_idx      on public.agency_entity_relationships(entity_id);
create index if not exists agency_rel_rel_type_idx       on public.agency_entity_relationships(relationship_type);
create index if not exists agency_rel_active_idx         on public.agency_entity_relationships(active);
-- Composite helpers for the most common reads (graph by agency, lookups by entity).
create index if not exists agency_rel_agency_active_idx  on public.agency_entity_relationships(agency_id, active);
create index if not exists agency_rel_entity_lookup_idx  on public.agency_entity_relationships(organization_id, entity_type, entity_id, active);

-- ── updated_at trigger (where the shared function exists) ────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at')
     and not exists (select 1 from pg_trigger where tgname = 'trg_agency_entity_relationships_updated') then
    execute 'create trigger trg_agency_entity_relationships_updated before update on public.agency_entity_relationships for each row execute function public.set_updated_at();';
  end if;
end $$;

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.agency_entity_relationships enable row level security;';

  execute 'drop policy if exists agency_entity_relationships_select on public.agency_entity_relationships;';
  execute 'create policy agency_entity_relationships_select on public.agency_entity_relationships for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists agency_entity_relationships_insert on public.agency_entity_relationships;';
  execute 'create policy agency_entity_relationships_insert on public.agency_entity_relationships for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_entity_relationships_update on public.agency_entity_relationships;';
  execute 'create policy agency_entity_relationships_update on public.agency_entity_relationships for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_entity_relationships_delete on public.agency_entity_relationships;';
  execute 'create policy agency_entity_relationships_delete on public.agency_entity_relationships for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.agency_entity_relationships to authenticated;';
  execute 'grant all privileges on public.agency_entity_relationships to service_role;';
end $$;
