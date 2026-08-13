-- P7.2D mirror: properties + org_invitations with the EXACT prod RLS write policies
-- + auth stubs, to prove before→revoke→after and service-role IDOR-safety.
create extension if not exists pgcrypto;
create schema if not exists auth;

create table public.users (id uuid primary key, org_id uuid not null, role_rank int not null default 100);
create table public.org_invitations (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, email text not null,
  role_key text not null default 'agent', token text, status text not null default 'pending',
  invited_by uuid, expires_at timestamptz, created_at timestamptz default now()
);
create table public.properties (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, owner_id uuid,
  title text not null, type text not null, listing_kind text not null default 'sale',
  status text not null default 'draft', price bigint not null, created_at timestamptz default now()
);

-- auth/session stubs mirroring prod
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function public.current_org_id() returns uuid language sql stable security definer set search_path=public as
$$ select org_id from public.users where id = auth.uid() $$;
create or replace function public.has_min_role(p_min text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select role_rank from public.users where id = auth.uid()), 0)
     >= case p_min when 'manager' then 60 when 'agent' then 40 else 0 end $$;

-- EXACT prod write policies
alter table public.org_invitations enable row level security;
alter table public.properties enable row level security;
grant select, insert, update, delete on public.org_invitations to authenticated, anon;
grant select, insert, update, delete on public.properties to authenticated, anon;

create policy org_invitations_select on public.org_invitations for select to authenticated using (org_id = current_org_id());
create policy org_invitations_insert on public.org_invitations for insert to authenticated with check (org_id = current_org_id() and has_min_role('manager'));
create policy org_invitations_update on public.org_invitations for update to authenticated using (org_id = current_org_id() and has_min_role('manager')) with check (org_id = current_org_id() and has_min_role('manager'));
create policy org_invitations_delete on public.org_invitations for delete to authenticated using (org_id = current_org_id() and has_min_role('manager'));

create policy properties_select on public.properties for select to authenticated using (org_id = current_org_id());
create policy properties_insert on public.properties for insert to authenticated with check (org_id = current_org_id() and has_min_role('agent'));
create policy properties_update on public.properties for update to authenticated using (org_id = current_org_id() and has_min_role('agent')) with check (org_id = current_org_id());
create policy properties_delete on public.properties for delete to authenticated using (org_id = current_org_id() and has_min_role('manager'));

-- Seed Pixel owner + RE/MAX owner + one RE/MAX property (for IDOR target)
insert into public.users values ('139e649a-25d6-4501-ab95-f02d796d4aab','0f1825d2-0ac8-45d1-b03c-50ce9e9366a2',100);
insert into public.users values ('18f0ba4d-79e5-46d0-af5c-76980cd74217','1a1e7da6-bb85-420a-978a-7deb8c35e63f',100);
insert into public.properties (id, org_id, owner_id, title, type, price)
  values ('cccccccc-0000-0000-0000-000000000001','1a1e7da6-bb85-420a-978a-7deb8c35e63f','18f0ba4d-79e5-46d0-af5c-76980cd74217','remax-listing','apartment',900000);
