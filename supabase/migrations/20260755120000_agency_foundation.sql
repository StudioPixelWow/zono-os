-- ============================================================================
-- ZONO — PHASE 26.0: AI Agency Intelligence Foundation™
-- ----------------------------------------------------------------------------
-- INFRASTRUCTURE ONLY. Makes every real-estate office (agency) a first-class,
-- org-scoped entity (like Properties / Buyers / Sellers). Additive + idempotent.
-- No UI changes, no AI, no scraping here — just the normalized schema + RLS.
-- Org column: organization_id. RLS via current_org_id() + has_min_role().
-- ============================================================================

-- ── agencies ─────────────────────────────────────────────────────────────────
create table if not exists public.agencies (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  normalized_name     text not null,
  legal_name          text,
  slug                text not null,
  logo_url            text,
  website             text,
  description         text,
  founded_year        integer,
  headquarters_city   text,
  headquarters_address text,
  google_place_id     text,
  phone               text,
  email               text,
  facebook_url        text,
  instagram_url       text,
  linkedin_url        text,
  youtube_url         text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, slug)
);
create index if not exists agencies_org_idx on public.agencies(organization_id);
create index if not exists agencies_org_normalized_idx on public.agencies(organization_id, normalized_name);
create index if not exists agencies_org_place_idx on public.agencies(organization_id, google_place_id) where google_place_id is not null;

-- ── agency_branches ──────────────────────────────────────────────────────────
create table if not exists public.agency_branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  city            text,
  neighborhood    text,
  address         text,
  phone           text,
  email           text,
  latitude        numeric,
  longitude       numeric,
  created_at      timestamptz not null default now()
);
create index if not exists agency_branches_agency_idx on public.agency_branches(agency_id);
create index if not exists agency_branches_org_idx on public.agency_branches(organization_id);

-- ── agency_agents (relation) ─────────────────────────────────────────────────
create table if not exists public.agency_agents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  agent_id          uuid references public.users(id) on delete set null,
  role              text,
  confidence_score  numeric,
  detection_method  text,
  first_detected_at timestamptz not null default now(),
  last_verified_at  timestamptz
);
create index if not exists agency_agents_agency_idx on public.agency_agents(agency_id);
create index if not exists agency_agents_org_idx on public.agency_agents(organization_id);

-- ── agency_identity_matches (every AI/heuristic match) ───────────────────────
create table if not exists public.agency_identity_matches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  source          text not null,
  source_url      text,
  matched_name    text,
  confidence      numeric,
  evidence        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists agency_identity_agency_idx on public.agency_identity_matches(agency_id);
create index if not exists agency_identity_org_idx on public.agency_identity_matches(organization_id);

-- ── agency_profiles (long-term business profile, 1:1) ────────────────────────
create table if not exists public.agency_profiles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  specialties     text[] not null default '{}',
  service_areas   text[] not null default '{}',
  languages       text[] not null default '{}',
  luxury          boolean not null default false,
  commercial      boolean not null default false,
  investments     boolean not null default false,
  rentals         boolean not null default false,
  projects        boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (agency_id)
);
create index if not exists agency_profiles_org_idx on public.agency_profiles(organization_id);

-- ── agency_scores (calculated scores, 1:1) ───────────────────────────────────
create table if not exists public.agency_scores (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  market_strength numeric,
  growth          numeric,
  digital         numeric,
  luxury          numeric,
  inventory       numeric,
  coverage        numeric,
  projects        numeric,
  reputation      numeric,
  momentum        numeric,
  overall         numeric,
  updated_at      timestamptz not null default now(),
  unique (agency_id)
);
create index if not exists agency_scores_org_idx on public.agency_scores(organization_id);

-- ── agency_signals ───────────────────────────────────────────────────────────
create table if not exists public.agency_signals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  signal_type     text not null,
  severity        text,
  title           text not null,
  description     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists agency_signals_agency_idx on public.agency_signals(agency_id, created_at desc);
create index if not exists agency_signals_org_idx on public.agency_signals(organization_id);

-- ── agency_timeline ──────────────────────────────────────────────────────────
create table if not exists public.agency_timeline (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  event_type      text not null,
  title           text not null,
  description     text,
  metadata        jsonb not null default '{}'::jsonb,
  event_date      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists agency_timeline_agency_idx on public.agency_timeline(agency_id, event_date desc);
create index if not exists agency_timeline_org_idx on public.agency_timeline(organization_id);

-- ── updated_at triggers (where the column exists) ────────────────────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    foreach t in array array['agencies','agency_profiles','agency_scores'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_' || t || '_updated') then
        execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at();', 'trg_' || t || '_updated', t);
      end if;
    end loop;
  end if;
end $$;

-- ── RLS — org isolation on every table ───────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'agencies','agency_branches','agency_agents','agency_identity_matches',
    'agency_profiles','agency_scores','agency_signals','agency_timeline'
  ] loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id());',
      t || '_select', t);

    -- agents+ may create/update; managers+ may delete.
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));',
      t || '_delete', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
