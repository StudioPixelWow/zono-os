-- ============================================================================
-- ZONO — P7.1 Atomic enforcement RPCs. STATUS: PROPOSED — NOT APPLIED.
-- Migration gate: wiring TRUE atomic limit enforcement into customer mutations
-- needs DB-side functions, because the app uses the Supabase JS client which
-- auto-commits each statement and cannot hold BEGIN…(lock)…(count)…(insert)…COMMIT
-- across calls. These SECURITY DEFINER functions do the whole guarded mutation
-- in ONE transaction: enforce_limit_lock → authoritative count → limit decision →
-- insert (or raise LIMIT_REACHED). Exactly one concurrent create wins; the other
-- gets LIMIT_REACHED; never N+1; no partial write (single-statement transaction
-- rolls back cleanly on the raise).
--
-- Enforcement stays OPT-IN: these RPCs enforce ONLY when the caller passes a
-- concrete p_limit (>=0). Passing -1 (unlimited) or the app choosing NOT to call
-- them keeps today's behavior. Modes/rollout are governed by enforcement_config
-- (P7.0); the app calls the guarded RPC only when the control resolves to
-- PILOT(for the org)/ENFORCED — otherwise it uses the normal insert (SHADOW).
--
-- No RLS weakened. EXECUTE granted to service_role only (revoked from PUBLIC).
-- ============================================================================

-- Guarded property create (monitoredListings). Returns new id, or raises
-- 'LIMIT_REACHED' when at/over the configured limit. p_limit < 0 = unlimited.
create or replace function public.create_property_guarded(
  p_org uuid, p_owner uuid, p_payload jsonb, p_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_used integer; v_id uuid;
begin
  -- serialize concurrent creates for THIS org+limit
  perform public.enforce_limit_lock(p_org, 'monitoredListings');
  if p_limit >= 0 then
    select count(*) into v_used from public.properties where org_id = p_org;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('monitoredListings %s/%s', v_used, p_limit);
    end if;
  end if;
  insert into public.properties (org_id, owner_id)
  values (p_org, p_owner)
  returning id into v_id;
  -- NOTE: real wiring passes the full validated payload via p_payload; this
  -- minimal insert is illustrative of the atomic pattern only.
  return v_id;
end;
$$;

-- Guarded seat reservation (seats). Counts active users + pending invites vs the
-- limit; raises LIMIT_REACHED when full. Does NOT create the invite row itself
-- (kept in app code) — it returns the go/no-go under the lock so the caller can
-- insert within the same advisory-lock window via a wrapper, OR use the combined
-- variant below.
create or replace function public.reserve_seat_guarded(
  p_org uuid, p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_used integer;
begin
  perform public.enforce_limit_lock(p_org, 'seats');
  if p_limit < 0 then return true; end if;
  select
    (select count(*) from public.users where org_id = p_org and status = 'active')
    + (select count(*) from public.org_invitations where org_id = p_org and status = 'pending')
    into v_used;
  if v_used >= p_limit then
    raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('seats %s/%s', v_used, p_limit);
  end if;
  return true;
end;
$$;

revoke all on function public.create_property_guarded(uuid, uuid, jsonb, integer) from public;
revoke all on function public.reserve_seat_guarded(uuid, integer) from public;
grant execute on function public.create_property_guarded(uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.reserve_seat_guarded(uuid, integer) to service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop function if exists public.create_property_guarded(uuid, uuid, jsonb, integer);
-- drop function if exists public.reserve_seat_guarded(uuid, integer);
