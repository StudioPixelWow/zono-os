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
