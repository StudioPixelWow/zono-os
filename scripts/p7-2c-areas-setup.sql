-- P7.2C prod-mirror: user_operating_localities (real UNIQUE + count semantics) +
-- enforce_limit_lock + create_operating_area_guarded (VERBATIM from migration).
-- FKs to israel_localities/users omitted on the mirror (the guard never references
-- them); the UNIQUE(user_id,locality_id) — the duplicate-semantics constraint — IS
-- reproduced. Pixel org seeded with 1 area (usage 1, limit 5). RE/MAX 0.
create extension if not exists pgcrypto;

create table public.user_operating_localities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  locality_id uuid not null,
  organization_id uuid,
  city_name text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  added_by uuid,
  neighborhoods jsonb not null default '[]',
  property_types jsonb not null default '[]',
  deal_types jsonb not null default '[]',
  use_for_leads boolean not null default true,
  use_for_properties boolean not null default true,
  use_for_transactions boolean not null default true,
  use_for_external_listings boolean not null default true,
  use_for_recommendations boolean not null default true,
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  constraint user_operating_locality_unique unique (user_id, locality_id)
);

create or replace function public.enforce_limit_lock(p_org uuid, p_key text)
returns void language plpgsql as
$$ begin perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_key,0)); end; $$;

-- create_operating_area_guarded — VERBATIM from 20271220120000
create or replace function public.create_operating_area_guarded(
  p_user uuid, p_org uuid, p_locality uuid, p_payload jsonb, p_limit integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_used integer; v_id uuid;
begin
  perform public.enforce_limit_lock(p_org, 'operatingAreas');
  select id into v_id from public.user_operating_localities
    where user_id = p_user and locality_id = p_locality;
  if v_id is not null then
    update public.user_operating_localities set
      organization_id = p_org,
      city_name = coalesce(nullif(p_payload->>'city_name',''), city_name),
      is_active = true,
      added_by = coalesce(nullif(p_payload->>'added_by','')::uuid, added_by),
      neighborhoods = coalesce(p_payload->'neighborhoods', neighborhoods),
      use_for_leads = coalesce((p_payload->>'use_for_leads')::boolean, use_for_leads),
      use_for_properties = coalesce((p_payload->>'use_for_properties')::boolean, use_for_properties),
      use_for_transactions = coalesce((p_payload->>'use_for_transactions')::boolean, use_for_transactions),
      use_for_external_listings = coalesce((p_payload->>'use_for_external_listings')::boolean, use_for_external_listings),
      use_for_recommendations = coalesce((p_payload->>'use_for_recommendations')::boolean, use_for_recommendations),
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;
  if p_limit >= 0 then
    select count(*) into v_used from public.user_operating_localities where organization_id = p_org;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('operatingAreas %s/%s', v_used, p_limit);
    end if;
  end if;
  insert into public.user_operating_localities (
    user_id, organization_id, locality_id, city_name, is_active, added_by,
    neighborhoods, use_for_leads, use_for_properties, use_for_transactions,
    use_for_external_listings, use_for_recommendations
  ) values (
    p_user, p_org, p_locality,
    nullif(p_payload->>'city_name',''),
    coalesce((p_payload->>'is_active')::boolean, true),
    nullif(p_payload->>'added_by','')::uuid,
    coalesce(p_payload->'neighborhoods', '[]'::jsonb),
    coalesce((p_payload->>'use_for_leads')::boolean, true),
    coalesce((p_payload->>'use_for_properties')::boolean, true),
    coalesce((p_payload->>'use_for_transactions')::boolean, true),
    coalesce((p_payload->>'use_for_external_listings')::boolean, true),
    coalesce((p_payload->>'use_for_recommendations')::boolean, true)
  ) returning id into v_id;
  return v_id;
end; $$;

-- Seed Pixel: 1 existing operating area (usage 1). user u1, locality L1.
insert into public.user_operating_localities (user_id, organization_id, locality_id, city_name)
  values ('11111111-1111-1111-1111-111111111111','0f1825d2-0ac8-45d1-b03c-50ce9e9366a2','aaaaaaaa-0000-0000-0000-000000000001','תל אביב');
