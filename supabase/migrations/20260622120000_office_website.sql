-- ============================================================================
-- ZONO — Office Website Generator OS (public digital HQ, generated from ZONO data)
-- ----------------------------------------------------------------------------
-- One website config per org. The public site is rendered server-side from the
-- existing brains (team / properties / projects / territory / transactions),
-- exposing ONLY public-safe data. Public reads + lead/event writes go through
-- the service-role client (the site is unauthenticated). Internal config is
-- org-scoped RLS (manager-gated). Idempotent. Org column: organization_id.
-- ============================================================================

-- 1) office_websites — one per organization
create table if not exists public.office_websites (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null unique references public.organizations(id) on delete cascade,
  slug                  text unique,
  status                text not null default 'draft',
  office_name           text,
  headline_hebrew       text,
  description_hebrew    text,
  cover_image_url       text,
  logo_url              text,
  phone                 text,
  whatsapp              text,
  email                 text,
  address               text,
  office_hours          text,
  social_links          jsonb not null default '{}'::jsonb,
  enabled_sections      jsonb not null default '{}'::jsonb,
  featured_property_ids uuid[] not null default '{}',
  featured_project_ids  uuid[] not null default '{}',
  testimonials          jsonb not null default '[]'::jsonb,
  theme                 jsonb not null default '{}'::jsonb,
  seo                   jsonb not null default '{}'::jsonb,
  view_count            integer not null default 0,
  last_published_at     timestamptz,
  created_by            uuid references public.users(id) on delete set null,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint office_websites_status_chk check (status in ('draft','published','disabled'))
);

-- 2) office_website_leads — raw website submissions (also promoted to leads)
create table if not exists public.office_website_leads (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  website_id          uuid references public.office_websites(id) on delete cascade,
  lead_id             uuid references public.leads(id) on delete set null,
  source_section      text not null default 'contact',
  full_name           text,
  phone               text,
  email               text,
  city                text,
  property_type       text,
  rooms               text,
  message             text,
  intent              text,
  status              text not null default 'new',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint office_website_leads_section_chk check (source_section in ('valuation','recruitment','property','project','contact','agent'))
);

-- 3) office_website_events — analytics
create table if not exists public.office_website_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  website_id          uuid references public.office_websites(id) on delete cascade,
  event_type          text not null,
  path                text,
  entity_type         text,
  entity_id           uuid,
  ip_hash             text,
  user_agent_hash     text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint office_website_events_type_chk check (event_type in (
    'page_view','property_view','project_view','agent_view','whatsapp_click',
    'call_click','form_submit','lead'
  ))
);

-- Indexes --------------------------------------------------------------------
create index if not exists office_sites_org_idx     on public.office_websites(organization_id);
create index if not exists office_sites_slug_idx    on public.office_websites(slug);
create index if not exists office_leads_org_idx     on public.office_website_leads(organization_id);
create index if not exists office_leads_site_idx    on public.office_website_leads(website_id);
create index if not exists office_events_org_idx    on public.office_website_events(organization_id);
create index if not exists office_events_site_idx   on public.office_website_events(website_id);
create index if not exists office_events_type_idx   on public.office_website_events(event_type);

-- updated_at trigger ---------------------------------------------------------
do $$
begin
  execute 'drop trigger if exists trg_office_websites_updated on public.office_websites;';
  execute 'create trigger trg_office_websites_updated before update on public.office_websites for each row execute function public.set_updated_at();';
end $$;

-- RLS — internal org-scoped (manager-gated). Public access via service-role.
do $$
declare t text;
  tbls text[] := array['office_websites','office_website_leads','office_website_events'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.office_websites, public.office_website_leads, public.office_website_events to authenticated;
grant all privileges on
  public.office_websites, public.office_website_leads, public.office_website_events to service_role;
