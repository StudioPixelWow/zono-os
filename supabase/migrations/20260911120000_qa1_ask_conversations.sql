-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 ASK ZONO CONVERSATION LOG. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "Ask ZONO conversations are not persisted" finding. Durable
-- log for audit, follow-up continuity, learning and future analytics. Private
-- to the org — never exposed on public routes. Writes run under service_role;
-- authenticated gets org-scoped READ (a user reads their own org's threads).
-- ============================================================================

create table if not exists public.zono_ask_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid,
  session_id  text not null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists zac_org_idx     on public.zono_ask_conversations (org_id);
create index if not exists zac_session_idx on public.zono_ask_conversations (org_id, session_id);
create index if not exists zac_updated_idx on public.zono_ask_conversations (org_id, updated_at desc);

create table if not exists public.zono_ask_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversation_id uuid references public.zono_ask_conversations(id) on delete cascade,
  session_id      text,
  user_id         uuid,
  question        text,
  answer          text,
  intent          text,
  source_engines  jsonb not null default '[]'::jsonb,
  evidence        jsonb not null default '[]'::jsonb,
  confidence      numeric,
  limitations     text,
  created_at      timestamptz not null default now()
);
create index if not exists zam_org_idx     on public.zono_ask_messages (org_id);
create index if not exists zam_conv_idx    on public.zono_ask_messages (conversation_id, created_at);
create index if not exists zam_created_idx on public.zono_ask_messages (org_id, created_at desc);

alter table public.zono_ask_conversations enable row level security;
alter table public.zono_ask_messages      enable row level security;

drop policy if exists zac_select on public.zono_ask_conversations;
create policy zac_select on public.zono_ask_conversations for select to authenticated
  using (public.is_zono_owner() or org_id = public.current_org_id());

drop policy if exists zam_select on public.zono_ask_messages;
create policy zam_select on public.zono_ask_messages for select to authenticated
  using (public.is_zono_owner() or org_id = public.current_org_id());
