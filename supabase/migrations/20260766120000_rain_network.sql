-- ============================================================================
-- ZONO — PHASE 26.9: RAIN Network / AI War Room Foundation™
-- ----------------------------------------------------------------------------
-- The strategic intelligence graph layer. Two additive tables:
--   rain_nodes — typed entities (agency/agent/property/deal/city/neighborhood/
--                street/developer/project/signal) derived from REAL ZONO data.
--   rain_edges — typed, weighted relationships between nodes.
-- Additive + idempotent. No UI dependency, no external scraping, no mock data.
-- Org column: organization_id. RLS via current_org_id() + has_min_role().
--
-- Idempotency:
--   a node is identified by (organization_id, node_type, entity_id)
--   an edge is identified by (organization_id, source_node_id, target_node_id, edge_type)
-- Re-runs upsert in place. Missing metrics are stored as NULL — never a fake 0.
-- ============================================================================

-- ── rain_nodes ───────────────────────────────────────────────────────────────
create table if not exists public.rain_nodes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  node_type          text not null,   -- agency|agent|property|deal|city|neighborhood|street|developer|project|signal
  entity_id          text not null,   -- stable id of the underlying entity (uuid or normalized key)
  label              text not null,
  subtitle           text,
  city               text,
  neighborhood       text,
  street             text,
  importance_score   numeric,         -- 0..100, NULL when not enough data (never fake 0)
  confidence         text not null default 'low',  -- low|medium|high
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, node_type, entity_id)
);

create index if not exists rain_nodes_org_idx        on public.rain_nodes(organization_id);
create index if not exists rain_nodes_type_idx       on public.rain_nodes(organization_id, node_type);
create index if not exists rain_nodes_entity_idx     on public.rain_nodes(organization_id, node_type, entity_id);
create index if not exists rain_nodes_city_idx       on public.rain_nodes(organization_id, city);
create index if not exists rain_nodes_importance_idx on public.rain_nodes(organization_id, node_type, importance_score desc);

-- ── rain_edges ───────────────────────────────────────────────────────────────
create table if not exists public.rain_edges (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  source_node_id     uuid not null references public.rain_nodes(id) on delete cascade,
  target_node_id     uuid not null references public.rain_nodes(id) on delete cascade,
  edge_type          text not null,   -- belongs_to|lists|sold|located_in|dominates|competes_with|connected_to|works_with|markets|triggered_signal
  strength           numeric,         -- 0..100, NULL when not computable (never fake 0)
  confidence         text not null default 'low',  -- low|medium|high
  evidence           jsonb not null default '{}'::jsonb,
  active             boolean not null default true,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, source_node_id, target_node_id, edge_type)
);

create index if not exists rain_edges_org_idx     on public.rain_edges(organization_id);
create index if not exists rain_edges_source_idx  on public.rain_edges(organization_id, source_node_id);
create index if not exists rain_edges_target_idx  on public.rain_edges(organization_id, target_node_id);
create index if not exists rain_edges_type_idx    on public.rain_edges(organization_id, edge_type);
create index if not exists rain_edges_active_idx  on public.rain_edges(organization_id, active);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_rain_nodes_updated') then
      execute 'create trigger trg_rain_nodes_updated before update on public.rain_nodes for each row execute function public.set_updated_at();';
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trg_rain_edges_updated') then
      execute 'create trigger trg_rain_edges_updated before update on public.rain_edges for each row execute function public.set_updated_at();';
    end if;
  end if;
end $$;

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.rain_nodes enable row level security;';
  execute 'drop policy if exists rain_nodes_select on public.rain_nodes;';
  execute 'create policy rain_nodes_select on public.rain_nodes for select to authenticated using (organization_id = public.current_org_id());';
  execute 'drop policy if exists rain_nodes_insert on public.rain_nodes;';
  execute 'create policy rain_nodes_insert on public.rain_nodes for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
  execute 'drop policy if exists rain_nodes_update on public.rain_nodes;';
  execute 'create policy rain_nodes_update on public.rain_nodes for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
  execute 'drop policy if exists rain_nodes_delete on public.rain_nodes;';
  execute 'create policy rain_nodes_delete on public.rain_nodes for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';
  execute 'grant select, insert, update, delete on public.rain_nodes to authenticated;';
  execute 'grant all privileges on public.rain_nodes to service_role;';

  execute 'alter table public.rain_edges enable row level security;';
  execute 'drop policy if exists rain_edges_select on public.rain_edges;';
  execute 'create policy rain_edges_select on public.rain_edges for select to authenticated using (organization_id = public.current_org_id());';
  execute 'drop policy if exists rain_edges_insert on public.rain_edges;';
  execute 'create policy rain_edges_insert on public.rain_edges for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
  execute 'drop policy if exists rain_edges_update on public.rain_edges;';
  execute 'create policy rain_edges_update on public.rain_edges for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';
  execute 'drop policy if exists rain_edges_delete on public.rain_edges;';
  execute 'create policy rain_edges_delete on public.rain_edges for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';
  execute 'grant select, insert, update, delete on public.rain_edges to authenticated;';
  execute 'grant all privileges on public.rain_edges to service_role;';
end $$;
