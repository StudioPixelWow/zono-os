-- ============================================================================
-- ZONO — Client Portal OS (first client-facing layer)
-- ----------------------------------------------------------------------------
-- Secure, shareable, agent-curated portals for buyers/sellers/leads/deals.
-- Public access is by a high-entropy token whose SHA-256 hash is the only thing
-- stored here (raw token never persisted). Public reads happen server-side via
-- the service-role client AFTER token-hash + status validation — never via RLS.
-- Internal access is org-scoped RLS. No internal scores / raw payloads here.
-- Idempotent. Org column: organization_id.
-- ============================================================================

-- 1) client_portals
create table if not exists public.client_portals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  portal_type         text not null,
  entity_type         text not null,
  entity_id           uuid not null,
  client_name         text,
  client_email        text,
  client_phone        text,
  title_hebrew        text,
  description_hebrew  text,
  access_token_hash   text not null,
  access_slug         text unique,
  status              text not null default 'draft',
  visibility_level    text not null default 'curated',
  expires_at          timestamptz,
  last_viewed_at      timestamptz,
  view_count          integer not null default 0,
  created_by          uuid references public.users(id) on delete set null,
  approved_by         uuid references public.users(id) on delete set null,
  approved_at         timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint client_portals_type_chk check (portal_type in ('buyer','seller','lead','deal','property')),
  constraint client_portals_status_chk check (status in ('draft','active','paused','expired','revoked')),
  constraint client_portals_visibility_chk check (visibility_level in ('minimal','curated','detailed'))
);

-- 2) client_portal_views
create table if not exists public.client_portal_views (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  portal_id           uuid references public.client_portals(id) on delete cascade,
  viewed_at           timestamptz not null default now(),
  ip_hash             text,
  user_agent_hash     text,
  referrer            text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- 3) client_portal_sections
create table if not exists public.client_portal_sections (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  portal_id           uuid references public.client_portals(id) on delete cascade,
  section_type        text not null,
  title_hebrew        text,
  content             jsonb not null default '{}'::jsonb,
  sort_order          integer not null default 0,
  is_visible          boolean not null default true,
  requires_approval   boolean not null default true,
  approved_by         uuid references public.users(id) on delete set null,
  approved_at         timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint client_portal_sections_type_chk check (section_type in (
    'summary','recommended_properties','property_comparison','similar_transactions',
    'neighborhood_insights','street_insights','pricing_analysis','buyer_demand',
    'marketing_activity','distribution_activity','viewings','documents','next_steps',
    'deal_progress','agent_contact','market_context'
  ))
);

-- 4) client_portal_items
create table if not exists public.client_portal_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  portal_id           uuid references public.client_portals(id) on delete cascade,
  section_id          uuid references public.client_portal_sections(id) on delete cascade,
  item_type           text not null,
  source_entity_type  text,
  source_entity_id    uuid,
  title_hebrew        text,
  description_hebrew  text,
  data                jsonb not null default '{}'::jsonb,
  is_visible          boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint client_portal_items_type_chk check (item_type in (
    'property','transaction','recommendation','market_insight','street','neighborhood',
    'document','task','viewing','deal_stage','marketing_activity','distribution_item'
  ))
);

-- Indexes --------------------------------------------------------------------
create index if not exists portals_org_idx        on public.client_portals(organization_id);
create index if not exists portals_entity_idx     on public.client_portals(entity_type, entity_id);
create index if not exists portals_token_idx      on public.client_portals(access_token_hash);
create index if not exists portals_status_idx     on public.client_portals(status);
create index if not exists portals_created_by_idx on public.client_portals(created_by);
create index if not exists portal_views_org_idx   on public.client_portal_views(organization_id);
create index if not exists portal_views_portal_idx on public.client_portal_views(portal_id);
create index if not exists portal_sections_portal_idx on public.client_portal_sections(portal_id);
create index if not exists portal_items_portal_idx on public.client_portal_items(portal_id);
create index if not exists portal_items_section_idx on public.client_portal_items(section_id);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
  tbls text[] := array['client_portals','client_portal_sections','client_portal_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS — internal org-scoped. Public access never uses RLS (service-role route).
do $$
declare t text;
  tbls text[] := array['client_portals','client_portal_views','client_portal_sections','client_portal_items'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.client_portals, public.client_portal_views, public.client_portal_sections, public.client_portal_items
  to authenticated;
grant all privileges on
  public.client_portals, public.client_portal_views, public.client_portal_sections, public.client_portal_items
  to service_role;
