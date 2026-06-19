-- ============================================================================
-- ZONO — 0017 · Unified Activity & Relationship Intelligence Layer
-- ----------------------------------------------------------------------------
-- One normalized stream (activity_events) + a generic relationship graph
-- (entity_relationships) + future-ready communications (threads/messages).
-- Every entity (property/buyer/seller/deal/…) reads its timeline from the same
-- activity_events table — the single source of truth. Tasks & meetings get
-- polymorphic links so intelligence can attach them to any entity.
--
-- Convention: org column is `org_id` (matches every table + current_org_id()).
-- ============================================================================

-- 1) activity_events — normalized event stream ------------------------------
create table public.activity_events (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  actor_user_id        uuid references public.users(id) on delete set null,
  actor_type           text not null default 'user',
  event_type           text not null,
  entity_type          text not null,
  entity_id            uuid not null,
  related_entity_type  text,
  related_entity_id    uuid,
  title                text not null,
  description          text,
  channel              text,
  direction            text,
  priority             text,
  status               text,
  sentiment            text,
  metadata             jsonb not null default '{}'::jsonb,
  occurred_at          timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create index activity_events_org_idx       on public.activity_events(org_id);
create index activity_events_entity_idx     on public.activity_events(entity_type, entity_id);
create index activity_events_related_idx     on public.activity_events(related_entity_type, related_entity_id);
create index activity_events_type_idx        on public.activity_events(event_type);
create index activity_events_occurred_idx    on public.activity_events(occurred_at desc);
create index activity_events_actor_idx       on public.activity_events(actor_user_id);

-- 2) entity_relationships — generic relationship graph ----------------------
create table public.entity_relationships (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  source_entity_type  text not null,
  source_entity_id    uuid not null,
  target_entity_type  text not null,
  target_entity_id    uuid not null,
  relationship_type   text not null,
  strength_score      integer not null default 0,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint entity_relationships_uniq unique
    (org_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type)
);

create index entity_relationships_org_idx    on public.entity_relationships(org_id);
create index entity_relationships_source_idx  on public.entity_relationships(source_entity_type, source_entity_id);
create index entity_relationships_target_idx  on public.entity_relationships(target_entity_type, target_entity_id);
create index entity_relationships_type_idx    on public.entity_relationships(relationship_type);
create index entity_relationships_status_idx  on public.entity_relationships(status);

-- 3) communication_threads (future-ready) -----------------------------------
create table public.communication_threads (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  contact_id      uuid,
  buyer_id        uuid references public.buyers(id) on delete set null,
  seller_id       uuid references public.sellers(id) on delete set null,
  property_id     uuid references public.properties(id) on delete set null,
  deal_id         uuid references public.deals(id) on delete set null,
  channel         text not null,
  title           text,
  status          text not null default 'open',
  last_message_at timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index communication_threads_org_idx      on public.communication_threads(org_id);
create index communication_threads_property_idx  on public.communication_threads(property_id);
create index communication_threads_buyer_idx      on public.communication_threads(buyer_id);

-- 4) communication_messages (future-ready) ----------------------------------
create table public.communication_messages (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  thread_id           uuid not null references public.communication_threads(id) on delete cascade,
  sender_user_id      uuid references public.users(id) on delete set null,
  direction           text not null,
  channel             text not null,
  subject             text,
  body                text,
  transcript          text,
  ai_summary          text,
  sentiment           text,
  external_message_id text,
  metadata            jsonb not null default '{}'::jsonb,
  sent_at             timestamptz,
  received_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index communication_messages_org_idx    on public.communication_messages(org_id);
create index communication_messages_thread_idx  on public.communication_messages(thread_id);

-- 5) Polymorphic links on tasks & meetings (non-breaking, all nullable) -----
alter table public.tasks
  add column if not exists entity_type          text,
  add column if not exists entity_id            uuid,
  add column if not exists related_entity_type  text,
  add column if not exists related_entity_id    uuid,
  add column if not exists impact_score         smallint,
  add column if not exists intelligence_source  text;

alter table public.meetings
  add column if not exists entity_type          text,
  add column if not exists entity_id            uuid,
  add column if not exists related_entity_type  text,
  add column if not exists related_entity_id    uuid,
  add column if not exists intelligence_source  text;

-- updated_at triggers (tables that carry updated_at) ------------------------
create trigger trg_entity_relationships_updated before update on public.entity_relationships
  for each row execute function public.set_updated_at();
create trigger trg_communication_threads_updated before update on public.communication_threads
  for each row execute function public.set_updated_at();

-- RLS — org-scoped for all four new tables ----------------------------------
do $$
declare t text;
  tbls text[] := array[
    'activity_events','entity_relationships','communication_threads','communication_messages'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select to authenticated '
      || 'using (org_id = public.current_org_id());', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$I for insert to authenticated '
      || 'with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format(
      'create policy "%1$s_update" on public.%1$I for update to authenticated '
      || 'using (org_id = public.current_org_id() and public.has_min_role(''manager'')) '
      || 'with check (org_id = public.current_org_id());', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$I for delete to authenticated '
      || 'using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.activity_events, public.entity_relationships,
  public.communication_threads, public.communication_messages
  to authenticated;
grant all privileges on
  public.activity_events, public.entity_relationships,
  public.communication_threads, public.communication_messages
  to service_role;
