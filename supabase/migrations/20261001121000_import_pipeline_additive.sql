-- ============================================================================
-- ZONO Wave 1 — CRM import pipeline (ADDITIVE, NOT YET APPLIED).
-- Batches + rows + saved mappings for CSV/XLSX import with preview, validation,
-- partial-failure reporting, duplicate handling, history, and rollback.
-- Rollback: DROP these tables (no existing data touched).
-- ============================================================================

create table if not exists public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid not null references public.users(id),
  entity_type     text not null check (entity_type in ('person','buyer','seller','property','task','note','lead')),
  source_filename text,
  file_hash       text,                       -- idempotency: same file not re-committed
  mapping         jsonb not null default '{}'::jsonb,
  duplicate_mode  text not null default 'review' check (duplicate_mode in
    ('skip_exact','update_blank','update_selected','create_separate','review')),
  status          text not null default 'uploaded' check (status in
    ('uploaded','mapping','validating','previewed','committing','committed','failed','rolled_back')),
  total_rows      int default 0,
  valid_rows      int default 0,
  invalid_rows    int default 0,
  skipped_rows    int default 0,
  duplicate_rows  int default 0,
  created_record_ids jsonb default '[]'::jsonb,
  updated_record_ids jsonb default '[]'::jsonb,
  error_file_path text,                        -- PRIVATE bucket path
  rollback_state  jsonb,                       -- captured pre-values for controlled updates
  rolled_back_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, file_hash, entity_type)   -- idempotent re-submit
);

create table if not exists public.import_rows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id        uuid not null references public.import_batches(id) on delete cascade,
  row_index       int not null,
  raw             jsonb not null,
  normalized      jsonb,
  outcome         text not null default 'pending' check (outcome in
    ('pending','created','updated','skipped_duplicate','review','failed')),
  resolved_person_id uuid references public.persons(id),
  errors          jsonb default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists public.import_mappings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null,
  name            text not null,
  mapping         jsonb not null,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  unique (organization_id, entity_type, name)
);

create index if not exists idx_import_rows_batch on public.import_rows(batch_id);
create index if not exists idx_import_batches_org on public.import_batches(organization_id, created_at desc);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_mappings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='import_batches' and policyname='import_batches_org_read') then
    create policy import_batches_org_read on public.import_batches for select using (organization_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='import_rows' and policyname='import_rows_org_read') then
    create policy import_rows_org_read on public.import_rows for select using (organization_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='import_mappings' and policyname='import_mappings_org_read') then
    create policy import_mappings_org_read on public.import_mappings for select using (organization_id = public.current_org_id());
  end if;
end $$;
