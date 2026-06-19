-- ============================================================================
-- ZONO — 0024 · External Listings Layer (Yad2 / Madlan ingestion foundation)
-- ----------------------------------------------------------------------------
-- External listings live in their OWN tables — they are NOT CRM properties
-- until explicitly promoted. Org-scoped RLS. Provider-agnostic (source text).
-- ============================================================================

create table public.external_listing_sources (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,
  provider      text not null,
  name          text not null,
  is_active     boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.external_listings (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  source                    text not null,
  source_id                 text not null,
  external_id               text,
  title                     text,
  city                      text,
  locality_id               uuid,
  neighborhood              text,
  street                    text,
  street_number             text,
  address                   text,
  property_type             text,
  deal_type                 text,
  price                     bigint,
  rooms                     numeric,
  bathrooms                 integer,
  balconies                 integer,
  floor                     integer,
  total_floors              integer,
  sqm                       integer,
  area_sqm                  integer,
  lot_size                  integer,
  parking                   boolean,
  storage                   boolean,
  elevator                  boolean,
  accessibility             boolean,
  secure_room               boolean,
  condition                 text,
  description               text,
  images                    jsonb not null default '[]'::jsonb,
  floorplan_images          jsonb not null default '[]'::jsonb,
  contact_name              text,
  contact_phone             text,
  contact_type              text,
  has_agent                 boolean,
  listing_url               text,
  published_at              timestamptz,
  first_seen_at             timestamptz not null default now(),
  imported_at               timestamptz not null default now(),
  last_synced_at            timestamptz,
  removed_at                timestamptz,
  status                    text not null default 'active',
  opportunity_score         smallint not null default 0,
  duplicate_group_id        uuid,
  duplicate_confidence_score smallint,
  primary_property_id       uuid references public.properties(id) on delete set null,
  promoted_property_id      uuid references public.properties(id) on delete set null,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint external_listings_uniq unique (org_id, source, source_id)
);

create table public.external_listing_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  listing_id  uuid not null references public.external_listings(id) on delete cascade,
  change_type text not null,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);

create table public.external_listing_duplicates (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  listing_id              uuid not null references public.external_listings(id) on delete cascade,
  duplicate_of_listing_id uuid references public.external_listings(id) on delete cascade,
  internal_property_id    uuid references public.properties(id) on delete set null,
  confidence_score        smallint not null default 0,
  reason                  text,
  status                  text not null default 'suspected',
  created_at              timestamptz not null default now()
);

create table public.import_jobs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  provider       text not null,
  status         text not null default 'pending',
  params         jsonb not null default '{}'::jsonb,
  total_found    integer not null default 0,
  total_imported integer not null default 0,
  total_updated  integer not null default 0,
  error          text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.import_job_logs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  job_id     uuid not null references public.import_jobs(id) on delete cascade,
  level      text not null default 'info',
  message    text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index external_listings_org_idx       on public.external_listings(org_id);
create index external_listings_source_idx      on public.external_listings(source);
create index external_listings_status_idx       on public.external_listings(status);
create index external_listings_opp_idx          on public.external_listings(opportunity_score desc);
create index external_listings_dupgroup_idx     on public.external_listings(duplicate_group_id);
create index external_listing_history_idx       on public.external_listing_history(listing_id);
create index external_listing_duplicates_idx     on public.external_listing_duplicates(listing_id);
create index import_jobs_org_idx                 on public.import_jobs(org_id);
create index import_job_logs_job_idx             on public.import_job_logs(job_id);

-- updated_at triggers
do $$
declare t text;
  tbls text[] := array['external_listing_sources','external_listings','import_jobs'];
begin
  foreach t in array tbls loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS: org-scoped (sources also allow shared system rows with org_id null)
alter table public.external_listing_sources enable row level security;
create policy "external_listing_sources_select" on public.external_listing_sources for select to authenticated using (org_id is null or org_id = public.current_org_id());
create policy "external_listing_sources_insert" on public.external_listing_sources for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('manager'));
create policy "external_listing_sources_update" on public.external_listing_sources for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager')) with check (org_id = public.current_org_id());
create policy "external_listing_sources_delete" on public.external_listing_sources for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));

do $$
declare t text;
  tbls text[] := array['external_listings','external_listing_history','external_listing_duplicates','import_jobs','import_job_logs'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.external_listing_sources, public.external_listings, public.external_listing_history,
  public.external_listing_duplicates, public.import_jobs, public.import_job_logs
  to authenticated;
grant all privileges on
  public.external_listing_sources, public.external_listings, public.external_listing_history,
  public.external_listing_duplicates, public.import_jobs, public.import_job_logs
  to service_role;
