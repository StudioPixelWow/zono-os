-- ============================================================================
-- ZONO — 0030 · Knowledge Graph & Relationship Intelligence OS
-- ----------------------------------------------------------------------------
-- A unified relationship graph across every entity. Nodes (graph_entities),
-- edges (graph_relationships, denormalized for fast 1-hop traversal), and
-- detected opportunities (graph_signals). Org-scoped. No cross-org visibility.
-- ============================================================================

-- 1) graph_entities — universal node registry
create table public.graph_entities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  entity_type      text not null,
  entity_id        text not null,
  title            text not null,
  subtitle         text,
  health_score     smallint not null default 0,
  importance_score smallint not null default 0,
  activity_score   smallint not null default 0,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint graph_entities_uniq unique (organization_id, entity_type, entity_id)
);
create index graph_entities_org_idx    on public.graph_entities(organization_id);
create index graph_entities_type_idx    on public.graph_entities(entity_type);
create index graph_entities_imp_idx      on public.graph_entities(importance_score desc);

-- 2) graph_relationships — universal edges (raw entity refs for easy traversal)
create table public.graph_relationships (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  source_entity_type  text not null,
  source_entity_id    text not null,
  target_entity_type  text not null,
  target_entity_id    text not null,
  relationship_type   text not null,
  strength_score      smallint not null default 0,
  confidence_score    smallint not null default 0,
  relationship_status text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint graph_relationships_uniq unique
    (organization_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type)
);
create index graph_rel_org_idx     on public.graph_relationships(organization_id);
create index graph_rel_source_idx   on public.graph_relationships(source_entity_type, source_entity_id);
create index graph_rel_target_idx   on public.graph_relationships(target_entity_type, target_entity_id);
create index graph_rel_type_idx      on public.graph_relationships(relationship_type);

-- 3) graph_signals — detected graph opportunities
create table public.graph_signals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  signal_type      text not null,
  title            text not null,
  description      text,
  confidence_score smallint not null default 60,
  impact_score     smallint not null default 50,
  source_entities  jsonb not null default '[]'::jsonb,
  status           text not null default 'new',
  created_at       timestamptz not null default now()
);
create index graph_signals_org_idx   on public.graph_signals(organization_id);
create index graph_signals_type_idx   on public.graph_signals(signal_type);
create index graph_signals_status_idx  on public.graph_signals(status);

-- updated_at triggers
create trigger trg_graph_entities_updated before update on public.graph_entities
  for each row execute function public.set_updated_at();
create trigger trg_graph_relationships_updated before update on public.graph_relationships
  for each row execute function public.set_updated_at();

-- RLS — org-scoped
do $$
declare t text;
  tbls text[] := array['graph_entities','graph_relationships','graph_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.graph_entities, public.graph_relationships, public.graph_signals to authenticated;
grant all privileges on
  public.graph_entities, public.graph_relationships, public.graph_signals to service_role;
