-- ============================================================================
-- ZONO — OFFICE MEMBERS: decouple "office agent (business entity)" from
-- "authenticated user". Historically every ownership FK pointed at public.users
-- (→ auth.users), so an office agent could not exist without a login. This adds a
-- roster entity that MAY link to a users row (login) but does not require one, so
-- an office can model invited / non-login / demo agents.
--
-- ADDITIVE + BACKWARD-COMPATIBLE: the existing owner_id/assigned_agent_id FKs to
-- users are UNTOUCHED. A new NULLABLE office_member_id is added alongside them, so
-- current engines keep reading user attribution while office-management views can
-- read member attribution. No column is dropped, no data migrated.
-- ============================================================================

create table if not exists public.office_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,   -- optional login link
  full_name   text not null,
  role        text not null default 'agent',
  status      text not null default 'active' check (status in ('active','invited','inactive')),
  avatar_url  text,
  phone       text,
  email       text,
  specialty   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_office_members_org on public.office_members (org_id);
-- One member row per linked login (when a login exists).
create unique index if not exists uq_office_members_user on public.office_members (org_id, user_id) where user_id is not null;

alter table public.office_members enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='office_members' and policyname='office_members_select') then
    create policy office_members_select on public.office_members
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='office_members' and policyname='office_members_write') then
    create policy office_members_write on public.office_members
      for all to authenticated
      using (org_id = public.current_org_id() and public.has_min_role('manager'))
      with check (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_office_members_updated_at' and tgrelid='public.office_members'::regclass) then
    create trigger trg_office_members_updated_at before update on public.office_members
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- Nullable member attribution alongside the existing user FKs (additive).
alter table public.leads      add column if not exists office_member_id uuid references public.office_members(id) on delete set null;
alter table public.properties add column if not exists office_member_id uuid references public.office_members(id) on delete set null;
alter table public.deals      add column if not exists office_member_id uuid references public.office_members(id) on delete set null;
alter table public.meetings   add column if not exists office_member_id uuid references public.office_members(id) on delete set null;
alter table public.tasks      add column if not exists office_member_id uuid references public.office_members(id) on delete set null;

create index if not exists idx_leads_office_member      on public.leads      (org_id, office_member_id);
create index if not exists idx_properties_office_member on public.properties (org_id, office_member_id);
create index if not exists idx_deals_office_member      on public.deals      (org_id, office_member_id);
create index if not exists idx_meetings_office_member   on public.meetings   (org_id, office_member_id);
create index if not exists idx_tasks_office_member      on public.tasks      (org_id, office_member_id);
