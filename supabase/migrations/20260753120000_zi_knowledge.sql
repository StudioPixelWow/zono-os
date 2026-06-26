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
