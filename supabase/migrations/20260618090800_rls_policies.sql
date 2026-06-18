-- ============================================================================
-- ZONO — 0009 · RLS helper functions, policies & grants
-- ----------------------------------------------------------------------------
-- Canonical rule: a row is visible to a user iff its org_id equals the caller's
-- organization. Writes are gated by role rank (owner>admin>manager>agent>viewer).
-- The matching engine, ingestion jobs and seeding run under service_role, which
-- has BYPASSRLS and is unaffected by these policies.
-- ============================================================================

-- ── Helper functions ──────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can read public.users without recursing through RLS.

create or replace function public.role_rank(p_key text)
returns int
language sql
immutable
as $$
  select case p_key
    when 'owner'   then 100
    when 'admin'   then 80
    when 'manager' then 60
    when 'agent'   then 40
    when 'viewer'  then 20
    else 0
  end;
$$;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid();
$$;

create or replace function public.current_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.key
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid();
$$;

create or replace function public.has_min_role(p_min text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_rank(public.current_role_key()) >= public.role_rank(p_min);
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org is not null and p_org = public.current_org_id();
$$;

grant execute on function
  public.role_rank(text),
  public.current_org_id(),
  public.current_role_key(),
  public.has_min_role(text),
  public.is_org_member(uuid)
to authenticated, anon;

-- ── Generic org-scoped tables ───────────────────────────────────────────────
-- Same four policies for every table that carries org_id and follows the
-- standard ownership model. SELECT for any org member; writes for agent+;
-- deletes for manager+.
do $$
declare
  t text;
  tbls text[] := array[
    'buyers', 'sellers', 'leads',
    'projects', 'units', 'properties',
    'deals', 'opportunities', 'matching_results',
    'activities', 'tasks', 'notes', 'meetings',
    'automations', 'documents'
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
      || 'using (org_id = public.current_org_id() and public.has_min_role(''agent'')) '
      || 'with check (org_id = public.current_org_id());', t);

    execute format(
      'create policy "%1$s_delete" on public.%1$I for delete to authenticated '
      || 'using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

-- ── organizations ──────────────────────────────────────────────────────────
-- Members read their own org; admins+ update it. Creating/deleting orgs is a
-- service_role operation (signup / billing), so no authenticated insert/delete.
alter table public.organizations enable row level security;

create policy "organizations_select" on public.organizations
  for select to authenticated
  using (id = public.current_org_id());

create policy "organizations_update" on public.organizations
  for update to authenticated
  using (id = public.current_org_id() and public.has_min_role('admin'))
  with check (id = public.current_org_id());

-- ── roles ────────────────────────────────────────────────────────────────────
alter table public.roles enable row level security;

create policy "roles_select" on public.roles
  for select to authenticated
  using (org_id = public.current_org_id());

create policy "roles_insert" on public.roles
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('admin'));

create policy "roles_update" on public.roles
  for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('admin'))
  with check (org_id = public.current_org_id());

create policy "roles_delete" on public.roles
  for delete to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('admin') and is_system = false);

-- ── users ─────────────────────────────────────────────────────────────────────
-- Members see colleagues in their org; a user may update their own profile,
-- admins may manage any member. Inserts (invites) are admin+ or service_role.
alter table public.users enable row level security;

create policy "users_select" on public.users
  for select to authenticated
  using (org_id = public.current_org_id());

create policy "users_insert" on public.users
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('admin'));

create policy "users_update" on public.users
  for update to authenticated
  using (id = auth.uid() or (org_id = public.current_org_id() and public.has_min_role('admin')))
  with check (org_id = public.current_org_id());

create policy "users_delete" on public.users
  for delete to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('admin') and id <> auth.uid());

-- ── notifications ──────────────────────────────────────────────────────────
-- Strictly per-recipient: a user only ever sees and mutates their own.
alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (org_id = public.current_org_id());

create policy "notifications_update" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications_delete" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ── Table privileges ───────────────────────────────────────────────────────
-- RLS decides row visibility; these grants give the Supabase roles the base
-- table privileges. anon receives nothing (no policies target it).
grant usage on schema public to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
