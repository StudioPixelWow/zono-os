-- P7.2 prod-mirror: Pixel's EXACT state + byte-identical deployed RPCs.
-- Pixel org = 0f1825d2… : seats usage 1 (1 active user), monitoredListings usage 14.
-- Pilot limits: seats=5, monitoredListings=30. RE/MAX org = 1a1e7da6… (isolation).
create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, status text not null default 'active'
);
create table public.org_invitations (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, email text not null,
  full_name text, role_key text not null default 'agent', token text, status text not null default 'pending',
  invited_by uuid, expires_at timestamptz, created_at timestamptz default now()
);
create table public.properties (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, owner_id uuid,
  uploaded_by_user_id uuid, assigned_agent_id uuid, title text not null, type text not null,
  listing_kind text not null default 'sale', status text not null default 'draft', price bigint not null,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_limit_lock(p_org uuid, p_key text)
returns void language plpgsql as
$$ begin perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,0)); end; $$;

-- deployed create_property_slot_guarded (verbatim)
create or replace function public.create_property_slot_guarded(p_org uuid, p_owner uuid, p_limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_used integer; v_id uuid;
begin
  perform public.enforce_limit_lock(p_org, 'monitoredListings');
  if p_limit >= 0 then
    select count(*) into v_used from public.properties where org_id = p_org;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('monitoredListings %s/%s', v_used, p_limit);
    end if;
  end if;
  insert into public.properties (org_id, owner_id, uploaded_by_user_id, assigned_agent_id, title, type, listing_kind, status, price)
  values (p_org, p_owner, p_owner, p_owner, 'טיוטה ללא שם', 'apartment', 'sale', 'draft', 0)
  returning id into v_id;
  return v_id;
end; $$;

-- deployed create_invitation_guarded (verbatim)
create or replace function public.create_invitation_guarded(p_org uuid, p_payload jsonb, p_limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_used integer; v_email text; v_id uuid;
begin
  perform public.enforce_limit_lock(p_org, 'seats');
  v_email := lower(trim(coalesce(p_payload->>'email','')));
  if v_email = '' then raise exception 'INVALID_EMAIL' using errcode = 'P0001'; end if;
  if exists (select 1 from public.org_invitations where org_id = p_org and lower(email::text) = v_email and status = 'pending')
    then raise exception 'DUPLICATE_PENDING' using errcode = 'P0001'; end if;
  if p_limit >= 0 then
    select (select count(*) from public.users where org_id = p_org and status = 'active')
         + (select count(*) from public.org_invitations where org_id = p_org and status = 'pending') into v_used;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('seats %s/%s', v_used, p_limit);
    end if;
  end if;
  insert into public.org_invitations (org_id, email, full_name, role_key, token, status, invited_by, expires_at)
  values (p_org, v_email, nullif(trim(coalesce(p_payload->>'full_name','')),''), coalesce(nullif(p_payload->>'role_key',''),'agent'),
          p_payload->>'token', 'pending', nullif(p_payload->>'invited_by','')::uuid, nullif(p_payload->>'expires_at','')::timestamptz)
  returning id into v_id;
  return v_id;
end; $$;

-- Seed Pixel exact state: 1 active user, 14 properties. RE/MAX: 1 user, 1 property.
insert into public.users (org_id, status) values ('0f1825d2-0ac8-45d1-b03c-50ce9e9366a2','active');
insert into public.properties (org_id, owner_id, title, type, price)
  select '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2','0f1825d2-0ac8-45d1-b03c-50ce9e9366a2','existing','apartment',1000000 from generate_series(1,14);
insert into public.users (org_id, status) values ('1a1e7da6-bb85-420a-978a-7deb8c35e63f','active');
insert into public.properties (org_id, owner_id, title, type, price)
  values ('1a1e7da6-bb85-420a-978a-7deb8c35e63f','1a1e7da6-bb85-420a-978a-7deb8c35e63f','remax','apartment',900000);
