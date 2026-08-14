-- P7.1 combined harness setup: minimal schema + EXACT applied RPC definitions.
-- Mirrors production: enforce_limit_lock (P7.0), create_property_guarded
-- (20271101130000, illustrative insert), create_invitation_guarded (20271115120000).
create extension if not exists pgcrypto;

create table public.organizations (id uuid primary key);
create table public.users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, status text not null default 'active'
);
create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, email text not null, full_name text,
  role_key text not null default 'agent', token text, status text not null default 'pending',
  invited_by uuid, expires_at timestamptz, created_at timestamptz default now()
);
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, owner_id uuid, qa jsonb
);

-- enforce_limit_lock (verbatim from P7.0)
create or replace function public.enforce_limit_lock(p_org uuid, p_key text)
returns void language plpgsql as
$$ begin perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,0)); end; $$;

-- create_property_guarded (verbatim from 20271101130000 — illustrative insert)
create or replace function public.create_property_guarded(
  p_org uuid, p_owner uuid, p_payload jsonb, p_limit integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_used integer; v_id uuid;
begin
  perform public.enforce_limit_lock(p_org, 'monitoredListings');
  if p_limit >= 0 then
    select count(*) into v_used from public.properties where org_id = p_org;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('monitoredListings %s/%s', v_used, p_limit);
    end if;
  end if;
  insert into public.properties (org_id, owner_id) values (p_org, p_owner) returning id into v_id;
  return v_id;
end; $$;

-- create_invitation_guarded (verbatim from 20271115120000 — completed atomic RPC)
create or replace function public.create_invitation_guarded(
  p_org uuid, p_payload jsonb, p_limit integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_used integer; v_email text; v_id uuid;
begin
  perform public.enforce_limit_lock(p_org, 'seats');
  v_email := lower(trim(coalesce(p_payload->>'email','')));
  if v_email = '' then raise exception 'INVALID_EMAIL' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.org_invitations
    where org_id = p_org and lower(email::text) = v_email and status = 'pending'
  ) then raise exception 'DUPLICATE_PENDING' using errcode = 'P0001'; end if;
  if p_limit >= 0 then
    select (select count(*) from public.users where org_id = p_org and status = 'active')
         + (select count(*) from public.org_invitations where org_id = p_org and status = 'pending')
      into v_used;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('seats %s/%s', v_used, p_limit);
    end if;
  end if;
  insert into public.org_invitations (org_id, email, full_name, role_key, token, status, invited_by, expires_at)
  values (
    p_org, v_email, nullif(trim(coalesce(p_payload->>'full_name','')), ''),
    coalesce(nullif(p_payload->>'role_key',''), 'agent'), p_payload->>'token', 'pending',
    nullif(p_payload->>'invited_by','')::uuid, nullif(p_payload->>'expires_at','')::timestamptz
  ) returning id into v_id;
  return v_id;
end; $$;

-- Seed: two orgs. ORG_A already has 2 active users (seat usage baseline = 2).
insert into public.organizations values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (org_id, status)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active' from generate_series(1,2);
