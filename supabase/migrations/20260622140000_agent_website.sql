-- ============================================================================
-- ZONO — Agent Website Generator OS (personal agent site, generated from ZONO)
-- ----------------------------------------------------------------------------
-- One website per agent (user). Public site is rendered server-side from the
-- agent's own data (profile / their listings / agent twin / their territories /
-- transactions) exposing ONLY public-safe data. Public reads + lead/event writes
-- use the service-role client. Internal config is org-scoped RLS: the agent can
-- edit their own site, managers can edit any. Idempotent. Org: organization_id.
-- ============================================================================

-- 1) agent_websites — one per agent (user)
create table if not exists public.agent_websites (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  slug                  text unique,
  status                text not null default 'draft',
  display_name          text,
  title_hebrew          text,
  headline_hebrew       text,
  bio_hebrew            text,
  profile_image_url     text,
  cover_image_url       text,
  phone                 text,
  whatsapp              text,
  email                 text,
  specialties           text[] not null default '{}',
  languages             text[] not null default '{}',
  service_areas         text[] not null default '{}',
  years_experience      integer,
  social_links          jsonb not null default '{}'::jsonb,
  enabled_sections      jsonb not null default '{}'::jsonb,
  featured_property_ids uuid[] not null default '{}',
  featured_project_ids  uuid[] not null default '{}',
  testimonials          jsonb not null default '[]'::jsonb,
  theme                 jsonb not null default '{}'::jsonb,
  seo                   jsonb not null default '{}'::jsonb,
  view_count            integer not null default 0,
  last_published_at     timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint agent_websites_status_chk check (status in ('draft','published','disabled')),
  constraint agent_websites_uniq unique (organization_id, user_id)
);

-- 2) agent_website_leads
create table if not exists public.agent_website_leads (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  agent_website_id    uuid references public.agent_websites(id) on delete cascade,
  agent_user_id       uuid references public.users(id) on delete set null,
  lead_id             uuid references public.leads(id) on delete set null,
  source_section      text not null default 'contact',
  full_name           text,
  phone               text,
  email               text,
  city                text,
  property_type       text,
  rooms               text,
  budget              text,
  timeline            text,
  message             text,
  intent              text,
  status              text not null default 'new',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint agent_website_leads_section_chk check (source_section in ('buyer_request','valuation','property','project','contact','meeting'))
);

-- 3) agent_website_events
create table if not exists public.agent_website_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  agent_website_id    uuid references public.agent_websites(id) on delete cascade,
  event_type          text not null,
  path                text,
  entity_type         text,
  entity_id           uuid,
  ip_hash             text,
  user_agent_hash     text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint agent_website_events_type_chk check (event_type in (
    'page_view','property_view','project_view','whatsapp_click','call_click',
    'meeting_request','valuation_request','form_submit','lead'
  ))
);

-- Indexes --------------------------------------------------------------------
create index if not exists agent_sites_org_idx     on public.agent_websites(organization_id);
create index if not exists agent_sites_user_idx    on public.agent_websites(user_id);
create index if not exists agent_sites_slug_idx     on public.agent_websites(slug);
create index if not exists agent_leads_org_idx     on public.agent_website_leads(organization_id);
create index if not exists agent_leads_site_idx    on public.agent_website_leads(agent_website_id);
create index if not exists agent_leads_agent_idx   on public.agent_website_leads(agent_user_id);
create index if not exists agent_events_org_idx    on public.agent_website_events(organization_id);
create index if not exists agent_events_site_idx   on public.agent_website_events(agent_website_id);

-- updated_at trigger ---------------------------------------------------------
do $$
begin
  execute 'drop trigger if exists trg_agent_websites_updated on public.agent_websites;';
  execute 'create trigger trg_agent_websites_updated before update on public.agent_websites for each row execute function public.set_updated_at();';
end $$;

-- RLS ------------------------------------------------------------------------
-- agent_websites: org members read; agent edits own OR manager edits any.
alter table public.agent_websites enable row level security;
drop policy if exists "agent_websites_select" on public.agent_websites;
create policy "agent_websites_select" on public.agent_websites for select to authenticated using (organization_id = public.current_org_id());
drop policy if exists "agent_websites_insert" on public.agent_websites;
create policy "agent_websites_insert" on public.agent_websites for insert to authenticated with check (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager')));
drop policy if exists "agent_websites_update" on public.agent_websites;
create policy "agent_websites_update" on public.agent_websites for update to authenticated using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager'))) with check (organization_id = public.current_org_id());
drop policy if exists "agent_websites_delete" on public.agent_websites;
create policy "agent_websites_delete" on public.agent_websites for delete to authenticated using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager')));

-- leads + events: org-scoped read; agent+ write.
do $$
declare t text;
  tbls text[] := array['agent_website_leads','agent_website_events'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.agent_websites, public.agent_website_leads, public.agent_website_events to authenticated;
grant all privileges on
  public.agent_websites, public.agent_website_leads, public.agent_website_events to service_role;
