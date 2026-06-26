-- ============================================================================
-- ZONO — Supabase migrations to run (paste into Supabase → SQL Editor → Run).
-- Safe to run as-is: every statement is additive + idempotent
-- (create table if not exists / drop policy if exists). Re-running is harmless.
-- Order matters: ZI Expert → Knowledge → Diagnostics → Agency Foundation.
-- Generated: 2026-06-26T05:11:26Z
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████
-- ▶ 20260752120000_zi_expert.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — ZI Expert™ Foundation (Phase 22)
-- ----------------------------------------------------------------------------
-- In-app AI SUPPORT assistant. ZI is READ-ONLY: it explains, guides and answers.
-- It never performs actions or mutates business data. These tables only store
-- the support conversation history (questions + answers + page context).
--
-- Two tables: zi_conversations (per user, per org) and zi_messages.
-- Both: org-scoped RLS, soft delete (deleted_at), search indexes. Additive +
-- idempotent. Org column: organization_id (matches the newer table convention).
-- ============================================================================

-- ── conversations ────────────────────────────────────────────────────────────
create table if not exists public.zi_conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null default 'שיחה חדשה',
  route            text,                       -- page the conversation started on
  module_id        text,                       -- navigation module id (smart page detection)
  pinned           boolean not null default false,
  archived         boolean not null default false,
  message_count    integer not null default 0,
  last_message_at  timestamptz,
  deleted_at       timestamptz,                -- soft delete
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists zi_conv_org_user_idx on public.zi_conversations(organization_id, user_id);
create index if not exists zi_conv_recent_idx on public.zi_conversations(organization_id, user_id, last_message_at desc);
create index if not exists zi_conv_pinned_idx on public.zi_conversations(organization_id, user_id, pinned) where deleted_at is null;
-- title search (trigram if available, else btree fallback)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists zi_conv_title_trgm on public.zi_conversations using gin (title gin_trgm_ops);
  else
    create index if not exists zi_conv_title_idx on public.zi_conversations(title);
  end if;
end $$;

-- ── messages ─────────────────────────────────────────────────────────────────
create table if not exists public.zi_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid not null references public.zi_conversations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  source           text check (source in ('ai','fallback','cache')),
  route            text,
  module_id        text,
  rating           text check (rating in ('up','down')),
  deleted_at       timestamptz,                -- soft delete
  created_at       timestamptz not null default now()
);

create index if not exists zi_msg_conv_idx on public.zi_messages(conversation_id, created_at);
create index if not exists zi_msg_org_user_idx on public.zi_messages(organization_id, user_id);
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists zi_msg_content_trgm on public.zi_messages using gin (content gin_trgm_ops);
  end if;
end $$;

-- ── updated_at trigger ────────────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_zi_conversations_updated') then
      create trigger trg_zi_conversations_updated before update on public.zi_conversations
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ── RLS — org-scoped, owner-of-row visibility ────────────────────────────────
alter table public.zi_conversations enable row level security;
alter table public.zi_messages enable row level security;

-- conversations: a user sees and manages their OWN conversations within their org
drop policy if exists "zi_conv_select" on public.zi_conversations;
create policy "zi_conv_select" on public.zi_conversations
  for select to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists "zi_conv_insert" on public.zi_conversations;
create policy "zi_conv_insert" on public.zi_conversations
  for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists "zi_conv_update" on public.zi_conversations;
create policy "zi_conv_update" on public.zi_conversations
  for update to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid())
  with check (organization_id = public.current_org_id() and user_id = auth.uid());

-- messages: same ownership rule
drop policy if exists "zi_msg_select" on public.zi_messages;
create policy "zi_msg_select" on public.zi_messages
  for select to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists "zi_msg_insert" on public.zi_messages;
create policy "zi_msg_insert" on public.zi_messages
  for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists "zi_msg_update" on public.zi_messages;
create policy "zi_msg_update" on public.zi_messages
  for update to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid())
  with check (organization_id = public.current_org_id() and user_id = auth.uid());

-- ── grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.zi_conversations to authenticated;
grant select, insert, update on public.zi_messages to authenticated;
grant all privileges on public.zi_conversations to service_role;
grant all privileges on public.zi_messages to service_role;

-- ████████████████████████████████████████████████████████████████████████
-- ▶ 20260753120000_zi_knowledge.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — ZI Expert™ Knowledge Engine (Phase 23)
-- ----------------------------------------------------------------------------
-- Read-only product knowledge base for ZI. System articles are GLOBAL
-- (organization_id NULL) and readable by everyone; custom ORG articles are
-- org-scoped. Plus chunks (retrieval), sources, and answer feedback. Additive +
-- idempotent. RLS: system rows world-readable to authenticated; org rows
-- org-scoped. System rows are written only by service_role (the sync).
-- ============================================================================

-- ── articles ─────────────────────────────────────────────────────────────────
create table if not exists public.zi_knowledge_articles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,  -- NULL = system/global
  slug             text not null,
  title            text not null,
  category         text not null default 'כללי',
  module           text,
  summary          text not null default '',
  content          text not null default '',
  keywords         text[] not null default '{}',
  role_visibility  text not null default 'agent',   -- viewer|agent|manager|admin|owner (min role)
  permissions      jsonb not null default '{}'::jsonb,
  source_type      text not null default 'system',  -- system | org
  source_path      text,
  version          integer not null default 1,
  published        boolean not null default true,
  routes           text[] not null default '{}',
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- one system row per slug; one org row per (org, slug)
create unique index if not exists zi_kb_sys_slug_ux on public.zi_knowledge_articles(slug) where organization_id is null;
create unique index if not exists zi_kb_org_slug_ux on public.zi_knowledge_articles(organization_id, slug) where organization_id is not null;
create index if not exists zi_kb_module_idx on public.zi_knowledge_articles(module) where deleted_at is null;
create index if not exists zi_kb_org_idx on public.zi_knowledge_articles(organization_id) where deleted_at is null;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists zi_kb_title_trgm on public.zi_knowledge_articles using gin (title gin_trgm_ops);
  end if;
end $$;

-- ── chunks (retrieval units) ─────────────────────────────────────────────────
create table if not exists public.zi_knowledge_chunks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,  -- NULL = system
  article_id       uuid not null references public.zi_knowledge_articles(id) on delete cascade,
  slug             text not null,
  ordinal          integer not null default 0,
  heading          text,
  content          text not null,
  keywords         text[] not null default '{}',
  created_at       timestamptz not null default now()
);
create index if not exists zi_kc_article_idx on public.zi_knowledge_chunks(article_id, ordinal);
create index if not exists zi_kc_org_idx on public.zi_knowledge_chunks(organization_id);

-- ── sources ──────────────────────────────────────────────────────────────────
create table if not exists public.zi_knowledge_sources (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,  -- NULL = system
  name             text not null,
  source_type      text not null default 'system',
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists zi_ks_org_idx on public.zi_knowledge_sources(organization_id);

-- ── answer feedback (helpful / not helpful / missing info) ───────────────────
create table if not exists public.zi_knowledge_feedback (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  question         text not null,
  answer           text not null default '',
  article_ids      text[] not null default '{}',
  route            text,
  module_id        text,
  role             text,
  rating           text not null check (rating in ('helpful','not_helpful','missing_info')),
  comment          text,
  created_at       timestamptz not null default now()
);
create index if not exists zi_kf_org_idx on public.zi_knowledge_feedback(organization_id, created_at desc);
create index if not exists zi_kf_rating_idx on public.zi_knowledge_feedback(organization_id, rating);

-- ── updated_at triggers ───────────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_zi_kb_updated') then
      create trigger trg_zi_kb_updated before update on public.zi_knowledge_articles for each row execute function public.set_updated_at();
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trg_zi_ks_updated') then
      create trigger trg_zi_ks_updated before update on public.zi_knowledge_sources for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.zi_knowledge_articles enable row level security;
alter table public.zi_knowledge_chunks   enable row level security;
alter table public.zi_knowledge_sources  enable row level security;
alter table public.zi_knowledge_feedback enable row level security;

-- articles: system (org NULL) readable by all authenticated; org rows org-scoped.
drop policy if exists "zi_kb_select" on public.zi_knowledge_articles;
create policy "zi_kb_select" on public.zi_knowledge_articles for select to authenticated
  using (organization_id is null or organization_id = public.current_org_id());
drop policy if exists "zi_kb_insert" on public.zi_knowledge_articles;
create policy "zi_kb_insert" on public.zi_knowledge_articles for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));
drop policy if exists "zi_kb_update" on public.zi_knowledge_articles;
create policy "zi_kb_update" on public.zi_knowledge_articles for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'))
  with check (organization_id = public.current_org_id() and public.has_min_role('manager'));

drop policy if exists "zi_kc_select" on public.zi_knowledge_chunks;
create policy "zi_kc_select" on public.zi_knowledge_chunks for select to authenticated
  using (organization_id is null or organization_id = public.current_org_id());

drop policy if exists "zi_ks_select" on public.zi_knowledge_sources;
create policy "zi_ks_select" on public.zi_knowledge_sources for select to authenticated
  using (organization_id is null or organization_id = public.current_org_id());

-- feedback: a user writes/reads their org's feedback (managers see the org's).
drop policy if exists "zi_kf_insert" on public.zi_knowledge_feedback;
create policy "zi_kf_insert" on public.zi_knowledge_feedback for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());
drop policy if exists "zi_kf_select" on public.zi_knowledge_feedback;
create policy "zi_kf_select" on public.zi_knowledge_feedback for select to authenticated
  using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager')));

-- ── grants ──────────────────────────────────────────────────────────────────
grant select, insert, update on public.zi_knowledge_articles to authenticated;
grant select on public.zi_knowledge_chunks to authenticated;
grant select on public.zi_knowledge_sources to authenticated;
grant select, insert on public.zi_knowledge_feedback to authenticated;
grant all privileges on public.zi_knowledge_articles, public.zi_knowledge_chunks, public.zi_knowledge_sources, public.zi_knowledge_feedback to service_role;

-- ████████████████████████████████████████████████████████████████████████
-- ▶ 20260754120000_zi_diagnostics.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — ZI Expert™ Diagnostics Engine (Phase 24)
-- ----------------------------------------------------------------------------
-- ZI diagnoses "why is this not working?" using a BOUNDED, non-sensitive signal
-- snapshot (system health, last sync, data coverage, permissions, env presence).
-- It is SUPPORT-ONLY: inspects + explains + suggests, never acts or mutates.
--
-- This table stores diagnostic RUNS for audit + the admin diagnostics view. It
-- contains ONLY redacted, non-sensitive fields: no secrets, no API keys, no raw
-- provider payloads, no cross-org data. Additive + idempotent.
-- ============================================================================

create table if not exists public.zi_diagnostic_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  correlation_id   text not null,                 -- safe id to reference in a support ticket
  issue_type       text not null,                 -- e.g. property_radar_empty / map_empty
  status           text not null check (status in ('healthy','warning','critical','unknown')),
  current_route    text,
  module           text,
  summary          text not null default '',
  likely_cause     text,
  role             text,                          -- caller role at diagnosis time (non-sensitive)
  findings         jsonb not null default '[]'::jsonb,   -- [{id,severity,title}] — titles only
  support_payload  jsonb not null default '{}'::jsonb,   -- redacted payload (no secrets / raw data)
  created_at       timestamptz not null default now()
);

create index if not exists zi_dx_org_idx on public.zi_diagnostic_runs(organization_id, created_at desc);
create index if not exists zi_dx_org_user_idx on public.zi_diagnostic_runs(organization_id, user_id, created_at desc);
create index if not exists zi_dx_issue_idx on public.zi_diagnostic_runs(organization_id, issue_type, created_at desc);

-- ── RLS — own rows for everyone; managers+ see all runs in their org ──────────
alter table public.zi_diagnostic_runs enable row level security;

drop policy if exists "zi_dx_select" on public.zi_diagnostic_runs;
create policy "zi_dx_select" on public.zi_diagnostic_runs
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (user_id = auth.uid() or public.has_min_role('manager'))
  );

drop policy if exists "zi_dx_insert" on public.zi_diagnostic_runs;
create policy "zi_dx_insert" on public.zi_diagnostic_runs
  for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());

-- ── grants ───────────────────────────────────────────────────────────────────
grant select, insert on public.zi_diagnostic_runs to authenticated;
grant all privileges on public.zi_diagnostic_runs to service_role;

-- ████████████████████████████████████████████████████████████████████████
-- ▶ 20260755120000_agency_foundation.sql
-- ████████████████████████████████████████████████████████████████████████

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
