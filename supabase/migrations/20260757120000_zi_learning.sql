-- ============================================================================
-- ZONO — PHASE 25: ZI Interactive Learning™ & Guided Support
-- ----------------------------------------------------------------------------
-- ZI stays SUPPORT-ONLY (teach / explain / guide). These tables store per-user
-- learning PROGRESS and optional org-authored learning content (tutorials, FAQ,
-- glossary, walkthroughs) on top of the built-in content shipped in code.
-- Additive + idempotent. Org-scoped RLS; progress is per-user.
-- ============================================================================

-- ── per-user progress ────────────────────────────────────────────────────────
create table if not exists public.zi_learning_progress (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('tutorial','walkthrough','glossary','faq','path')),
  slug            text not null,
  status          text not null default 'viewed' check (status in ('viewed','in_progress','completed')),
  favorite        boolean not null default false,
  last_step       integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id, kind, slug)
);
create index if not exists zi_learn_user_idx on public.zi_learning_progress(organization_id, user_id, updated_at desc);

-- ── org-authored content (optional; built-ins live in code) ──────────────────
create table if not exists public.zi_tutorials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null, module text, title text not null, summary text,
  steps jsonb not null default '[]'::jsonb, role_min text not null default 'agent',
  published boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (organization_id, slug)
);
create table if not exists public.zi_walkthroughs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null, module text, title text not null, goal text,
  estimated_minutes integer not null default 3, prerequisites jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb, common_mistakes jsonb not null default '[]'::jsonb,
  pro_tips jsonb not null default '[]'::jsonb, role_min text not null default 'agent',
  published boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (organization_id, slug)
);
create table if not exists public.zi_glossary (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null, term text not null, definition text not null,
  where_used text, related jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create table if not exists public.zi_faq (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null, module text, question text not null, answer text not null,
  role_min text not null default 'agent', published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

-- ── updated_at triggers ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    foreach t in array array['zi_learning_progress','zi_tutorials','zi_walkthroughs','zi_glossary','zi_faq'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_' || t || '_updated') then
        execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at();', 'trg_' || t || '_updated', t);
      end if;
    end loop;
  end if;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- progress: a user manages only their OWN rows within their org.
alter table public.zi_learning_progress enable row level security;
drop policy if exists "zi_learn_select" on public.zi_learning_progress;
create policy "zi_learn_select" on public.zi_learning_progress for select to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid());
drop policy if exists "zi_learn_insert" on public.zi_learning_progress;
create policy "zi_learn_insert" on public.zi_learning_progress for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());
drop policy if exists "zi_learn_update" on public.zi_learning_progress;
create policy "zi_learn_update" on public.zi_learning_progress for update to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid())
  with check (organization_id = public.current_org_id() and user_id = auth.uid());
grant select, insert, update on public.zi_learning_progress to authenticated;
grant all privileges on public.zi_learning_progress to service_role;

-- content tables: everyone in org reads; managers+ author.
do $$
declare t text;
begin
  foreach t in array array['zi_tutorials','zi_walkthroughs','zi_glossary','zi_faq'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id());', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager'')) with check (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
