-- ============================================================================
-- ZONO — P7.2C operatingAreas atomic enforcement. STATUS: PROPOSED — NOT APPLIED.
-- Completes the last concurrency-sensitive limit (operatingAreas) with an atomic
-- guard, matching the seats/listings pattern.
--
-- USAGE SEMANTICS (must match P6.3 usageFor): one unit = one
-- user_operating_localities ROW for the org — count(*) where organization_id=org
-- (active + inactive both count, exactly as usageFor does). UNIQUE(user_id,
-- locality_id) means re-adding the SAME (user,locality) is an UPDATE (re-activate),
-- NOT a new row → consumes NO new unit. Two different users adding the same
-- locality = two rows = two units (org-level count), which is what the counter
-- reports. This RPC enforces exactly that.
--
-- ATOMIC CONTRACT (one transaction): enforce_limit_lock('operatingAreas') →
-- if (user,locality) already exists → UPDATE it (re-activate), no limit check,
-- no new unit; else authoritative count(*) for the org → LIMIT_REACHED if at cap
-- → INSERT. Two concurrent DIFFERENT-area creates at the final slot: exactly one
-- wins, the other LIMIT_REACHED; never N+1. Concurrent SAME-area requests are
-- serialized by the lock and the existence check → exactly one row, no double
-- consumption, no false LIMIT_REACHED, no unique-violation race.
--
-- The guard owns ONLY the unit-consuming upsert. Best-effort side effects
-- (set-primary, org-locality mirror, neighbourhood discovery, market learning)
-- stay in app code, unchanged. No dynamic SQL. Explicit columns. Server passes a
-- validated payload; org/user authority is derived server-side (never browser).
-- p_limit < 0 = unlimited. SECURITY DEFINER; EXECUTE service_role only.
-- ============================================================================

create or replace function public.create_operating_area_guarded(
  p_user uuid, p_org uuid, p_locality uuid, p_payload jsonb, p_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_used integer; v_id uuid;
begin
  -- serialize concurrent operating-area consumption for THIS org
  perform public.enforce_limit_lock(p_org, 'operatingAreas');

  -- Re-activation of an existing (user,locality): UPDATE in place, consumes no
  -- new unit → no limit check (idempotent, matches the app's upsert semantics).
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

  -- New (user,locality): authoritative usage = ALL org rows (matches usageFor()).
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
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Supabase auto-grants EXECUTE to anon/authenticated on new functions — revoke explicitly.
revoke all on function public.create_operating_area_guarded(uuid, uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_operating_area_guarded(uuid, uuid, uuid, jsonb, integer) to service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop function if exists public.create_operating_area_guarded(uuid, uuid, uuid, jsonb, integer);
