-- ============================================================================
-- ZONO — P7.1 RPC completion (follow-up). STATUS: PROPOSED — NOT APPLIED.
-- Migration gate: complete the SEAT/invitation guarded RPC so it OWNS the atomic
-- lock+count+duplicate-check+insert in ONE transaction (no check-then-insert
-- split). This is the path that unblocks multi-agent seat enforcement + the
-- future clean-office QA (creating 3 agents without manual DB intervention).
--
-- Business validation (isManager, token generation, email/role validation)
-- stays in server code; the RPC owns ONLY the DB-critical atomic section and
-- receives an already-validated payload from the trusted server (service_role).
-- No dynamic SQL. Explicit columns. service_role only.
--
-- PROPERTY guard (create_property_guarded) is intentionally NOT completed here:
-- the properties table has ~40 NOT-NULL columns (many enum/jsonb with defaults),
-- so a clean atomic full insert would require either dynamic SQL (forbidden) or
-- brittle 40-column coupling (over-expansion). Property limit enforcement is
-- deferred to a separate design decision — see the P7.1 report. The existing
-- create_property_guarded stays applied + ACL-locked but UNWIRED.
-- ============================================================================

create or replace function public.create_invitation_guarded(
  p_org uuid, p_payload jsonb, p_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_used integer; v_email text; v_id uuid;
begin
  -- serialize concurrent seat consumption for THIS org
  perform public.enforce_limit_lock(p_org, 'seats');

  v_email := lower(trim(coalesce(p_payload->>'email','')));
  if v_email = '' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;

  -- duplicate pending protection (inside the lock → race-free)
  if exists (
    select 1 from public.org_invitations
    where org_id = p_org and lower(email::text) = v_email and status = 'pending'
  ) then
    raise exception 'DUPLICATE_PENDING' using errcode = 'P0001';
  end if;

  -- authoritative seat usage = active users + pending invites
  if p_limit >= 0 then
    select (select count(*) from public.users where org_id = p_org and status = 'active')
         + (select count(*) from public.org_invitations where org_id = p_org and status = 'pending')
      into v_used;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('seats %s/%s', v_used, p_limit);
    end if;
  end if;

  -- atomic insert (explicit columns; server-validated payload)
  insert into public.org_invitations (org_id, email, full_name, role_key, token, status, invited_by, expires_at)
  values (
    p_org,
    v_email,
    nullif(trim(coalesce(p_payload->>'full_name','')), ''),
    coalesce(nullif(p_payload->>'role_key',''), 'agent'),
    p_payload->>'token',
    'pending',
    nullif(p_payload->>'invited_by','')::uuid,
    nullif(p_payload->>'expires_at','')::timestamptz
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Supabase auto-grants EXECUTE to anon/authenticated on new functions — revoke explicitly.
revoke all on function public.create_invitation_guarded(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_invitation_guarded(uuid, jsonb, integer) to service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop function if exists public.create_invitation_guarded(uuid, jsonb, integer);
