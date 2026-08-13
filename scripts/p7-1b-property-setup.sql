-- P7.1B property race setup: minimal properties schema honoring the REAL
-- NOT-NULL contract (org_id, title, type, price required; rest defaulted), plus
-- enforce_limit_lock and create_property_slot_guarded VERBATIM from the migration.
create extension if not exists pgcrypto;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  owner_id uuid,
  uploaded_by_user_id uuid,
  assigned_agent_id uuid,
  title text not null,
  type text not null,
  listing_kind text not null default 'sale',
  status text not null default 'draft',
  price bigint not null,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_limit_lock(p_org uuid, p_key text)
returns void language plpgsql as
$$ begin perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,0)); end; $$;

-- create_property_slot_guarded — VERBATIM from 20271201120000
create or replace function public.create_property_slot_guarded(
  p_org uuid, p_owner uuid, p_limit integer
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
  insert into public.properties (
    org_id, owner_id, uploaded_by_user_id, assigned_agent_id,
    title, type, listing_kind, status, price
  ) values (
    p_org, p_owner, p_owner, p_owner,
    'טיוטה ללא שם', 'apartment', 'sale', 'draft', 0
  ) returning id into v_id;
  return v_id;
end; $$;

-- Seed: ORG_A already has 2 properties (usage baseline = 2); ORG_B has 0.
insert into public.properties (org_id, owner_id, title, type, price)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','existing','apartment',1000000
  from generate_series(1,2);
