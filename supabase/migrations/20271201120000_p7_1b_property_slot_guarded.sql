-- ============================================================================
-- ZONO — P7.1B Property enforcement completion. STATUS: PROPOSED — NOT APPLIED.
-- Migration gate: complete ATOMIC property-limit (monitoredListings) enforcement.
--
-- KEY DESIGN — the reservation IS the draft row.
-- The real property-creation UX is draft-first: a minimal `status='draft'` row is
-- inserted on wizard entry (createDraftProperty), then enriched via UPDATE
-- (saveDraft) and flipped to published (markPublished). The monitoredListings
-- usage counter counts ALL property rows for the org (drafts included). So the
-- slot is consumed the instant a NEW row appears — that is the ONLY correct place
-- to enforce, and it is consistent with the counter (never over/under-admits).
--
-- Because the reservation is just the minimal draft row, this RPC owns ONLY a
-- small FIXED-column insert (org_id, owner_id, uploaded_by_user_id,
-- assigned_agent_id, title, type, listing_kind, status='draft', price=0) — the
-- exact columns createDraftProperty already writes. The rich ~40-column payload
-- stays in the EXISTING app-side UPDATE path (saveDraft / publish) — NO dynamic
-- SQL, NO 40-column duplication into the RPC, NO dual-write, NO drift.
--
-- Atomicity: enforce_limit_lock('monitoredListings') → authoritative count →
-- limit decision → insert, all in ONE transaction. Two concurrent final-slot
-- creates: exactly one wins, the other gets LIMIT_REACHED; never N+1; the raise
-- rolls back cleanly (no partial row). p_limit < 0 = unlimited (no count).
--
-- Stale-reservation safety: an abandoned empty draft (title unchanged, price 0,
-- no media) is reclaimed by the EXISTING cleanupAbandonedDrafts sweep, so a
-- consumed-but-unused slot self-heals — no permanent quota leak.
--
-- No RLS weakened. EXECUTE granted to service_role only (revoked from PUBLIC).
-- The illustrative P7.1 create_property_guarded (org_id/owner_id-only insert,
-- which could never satisfy the NOT-NULL title/type/price contract) is dropped
-- here and SUPERSEDED by this correct primitive.
-- ============================================================================

-- Remove the illustrative, never-wired P7.1 property guard (superseded below).
drop function if exists public.create_property_guarded(uuid, uuid, jsonb, integer);

-- Atomic monitoredListings slot reservation = a minimal valid draft row.
-- Returns the new draft's id, or raises 'LIMIT_REACHED' when at/over the limit.
create or replace function public.create_property_slot_guarded(
  p_org uuid, p_owner uuid, p_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_used integer; v_id uuid;
begin
  -- serialize concurrent property-slot consumption for THIS org
  perform public.enforce_limit_lock(p_org, 'monitoredListings');

  -- authoritative usage = ALL property rows for the org (matches usageFor())
  if p_limit >= 0 then
    select count(*) into v_used from public.properties where org_id = p_org;
    if v_used >= p_limit then
      raise exception 'LIMIT_REACHED' using errcode = 'P0001', detail = format('monitoredListings %s/%s', v_used, p_limit);
    end if;
  end if;

  -- minimal valid draft (fixed columns only — mirrors createDraftProperty).
  -- Rich fields are added later by the app-side UPDATE (saveDraft/publish).
  insert into public.properties (
    org_id, owner_id, uploaded_by_user_id, assigned_agent_id,
    title, type, listing_kind, status, price
  ) values (
    p_org, p_owner, p_owner, p_owner,
    'טיוטה ללא שם', 'apartment', 'sale', 'draft', 0
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Supabase auto-grants EXECUTE to anon/authenticated on new functions — revoke explicitly.
revoke all on function public.create_property_slot_guarded(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.create_property_slot_guarded(uuid, uuid, integer) to service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop function if exists public.create_property_slot_guarded(uuid, uuid, integer);
-- (the illustrative create_property_guarded is intentionally not recreated)
