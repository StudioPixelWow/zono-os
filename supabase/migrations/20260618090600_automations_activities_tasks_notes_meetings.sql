-- ============================================================================
-- ZONO — 0007 · Engagement: automations, activities, tasks, notes, meetings
-- ----------------------------------------------------------------------------
-- automations is created first so activities can attribute auto-generated
-- entries to the automation that produced them. The engagement tables share a
-- common set of optional foreign keys linking them to any core entity.
-- ============================================================================

-- ── automations ───────────────────────────────────────────────────────────────
create table public.automations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  created_by      uuid references public.users(id) on delete set null,
  name            text not null,
  description     text,
  status          automation_status not null default 'draft',
  is_enabled      boolean not null default true,
  trigger         automation_trigger not null,
  trigger_config  jsonb not null default '{}'::jsonb,
  conditions      jsonb not null default '[]'::jsonb,
  actions         jsonb not null default '[]'::jsonb,
  last_run_at     timestamptz,
  run_count       integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_automations_org on public.automations (org_id);
create index idx_automations_org_enabled on public.automations (org_id, is_enabled);
create index idx_automations_trigger on public.automations (trigger);

create trigger trg_automations_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

-- ── activities ────────────────────────────────────────────────────────────────
-- Append log of interactions and system events. No updated_at (immutable).
create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  actor_id       uuid references public.users(id) on delete set null,
  type           activity_type not null,
  direction      activity_direction not null default 'internal',
  subject        text,
  body           text,
  metadata       jsonb not null default '{}'::jsonb,
  automation_id  uuid references public.automations(id) on delete set null,
  buyer_id       uuid references public.buyers(id) on delete set null,
  seller_id      uuid references public.sellers(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  property_id    uuid references public.properties(id) on delete set null,
  unit_id        uuid references public.units(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,
  deal_id        uuid references public.deals(id) on delete set null,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index idx_activities_org_occurred on public.activities (org_id, occurred_at desc);
create index idx_activities_actor on public.activities (actor_id);
create index idx_activities_buyer on public.activities (buyer_id);
create index idx_activities_seller on public.activities (seller_id);
create index idx_activities_lead on public.activities (lead_id);
create index idx_activities_property on public.activities (property_id);
create index idx_activities_deal on public.activities (deal_id);

-- ── tasks ─────────────────────────────────────────────────────────────────────
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  assignee_id     uuid references public.users(id) on delete set null,
  created_by      uuid references public.users(id) on delete set null,
  title           text not null,
  description     text,
  status          task_status not null default 'todo',
  priority        task_priority not null default 'medium',
  due_at          timestamptz,
  completed_at    timestamptz,
  is_automatable  boolean not null default false,
  buyer_id        uuid references public.buyers(id) on delete set null,
  seller_id       uuid references public.sellers(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  property_id     uuid references public.properties(id) on delete set null,
  unit_id         uuid references public.units(id) on delete set null,
  project_id      uuid references public.projects(id) on delete set null,
  deal_id         uuid references public.deals(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tasks_org on public.tasks (org_id);
create index idx_tasks_assignee_status on public.tasks (assignee_id, status);
create index idx_tasks_org_due on public.tasks (org_id, due_at);
create index idx_tasks_deal on public.tasks (deal_id);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ── notes ─────────────────────────────────────────────────────────────────────
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  author_id    uuid references public.users(id) on delete set null,
  body         text not null,
  is_pinned    boolean not null default false,
  buyer_id     uuid references public.buyers(id) on delete set null,
  seller_id    uuid references public.sellers(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  property_id  uuid references public.properties(id) on delete set null,
  unit_id      uuid references public.units(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  deal_id      uuid references public.deals(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_notes_org on public.notes (org_id);
create index idx_notes_author on public.notes (author_id);
create index idx_notes_buyer on public.notes (buyer_id);
create index idx_notes_property on public.notes (property_id);
create index idx_notes_deal on public.notes (deal_id);

create trigger trg_notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ── meetings ──────────────────────────────────────────────────────────────────
create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  organizer_id  uuid references public.users(id) on delete set null,
  type          meeting_type not null default 'meeting',
  status        meeting_status not null default 'scheduled',
  title         text not null,
  description   text,
  location      jsonb not null default '{}'::jsonb,
  start_at      timestamptz not null,
  end_at        timestamptz,
  all_day       boolean not null default false,
  attendees     jsonb not null default '[]'::jsonb,
  buyer_id      uuid references public.buyers(id) on delete set null,
  seller_id     uuid references public.sellers(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  property_id   uuid references public.properties(id) on delete set null,
  unit_id       uuid references public.units(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint meetings_time_order check (end_at is null or end_at >= start_at)
);

create index idx_meetings_org on public.meetings (org_id);
create index idx_meetings_organizer_start on public.meetings (organizer_id, start_at);
create index idx_meetings_org_start on public.meetings (org_id, start_at);
create index idx_meetings_property on public.meetings (property_id);

create trigger trg_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();
