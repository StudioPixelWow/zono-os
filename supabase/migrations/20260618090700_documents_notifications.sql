-- ============================================================================
-- ZONO — 0008 · Documents & Notifications
-- ----------------------------------------------------------------------------
-- documents wrap files (in Supabase Storage) plus an optional signature flow.
-- notifications are per-user in-app messages; the recipient is user_id.
-- ============================================================================

-- ── documents ─────────────────────────────────────────────────────────────────
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  owner_id      uuid references public.users(id) on delete set null,
  type          document_type not null default 'other',
  status        document_status not null default 'draft',
  title         text not null,
  file_url      text,
  storage_path  text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  signers       jsonb not null default '[]'::jsonb,
  signed_at     timestamptz,
  expires_at    timestamptz,
  buyer_id      uuid references public.buyers(id) on delete set null,
  seller_id     uuid references public.sellers(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  property_id   uuid references public.properties(id) on delete set null,
  unit_id       uuid references public.units(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_documents_org_status on public.documents (org_id, status);
create index idx_documents_owner on public.documents (owner_id);
create index idx_documents_property on public.documents (property_id);
create index idx_documents_deal on public.documents (deal_id);
create index idx_documents_type on public.documents (type);

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ── notifications ─────────────────────────────────────────────────────────────
-- In-app notifications addressed to a single recipient user.
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  level           notification_level not null default 'info',
  category        notification_category,
  title           text not null,
  body            text,
  is_read         boolean not null default false,
  read_at         timestamptz,
  href            text,
  buyer_id        uuid references public.buyers(id) on delete set null,
  seller_id       uuid references public.sellers(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  property_id     uuid references public.properties(id) on delete set null,
  deal_id         uuid references public.deals(id) on delete set null,
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  task_id         uuid references public.tasks(id) on delete set null,
  meeting_id      uuid references public.meetings(id) on delete set null,
  due_at          timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_notifications_user_unread on public.notifications (user_id, is_read, created_at desc);
create index idx_notifications_org on public.notifications (org_id);
create index idx_notifications_due on public.notifications (due_at);
