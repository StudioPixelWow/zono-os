-- ============================================================================
-- ZONO — Block privileged self-update on public.users (privilege-escalation fix).
-- ----------------------------------------------------------------------------
-- The `users_update` RLS policy allows a member to update their OWN row
-- (USING id = auth.uid()) with a WITH CHECK that only re-verifies org_id. RLS
-- policies cannot compare OLD vs NEW, so nothing stopped an ordinary member from
-- doing `update users set role_id = <admin> where id = auth.uid()` and
-- self-promoting (org_id unchanged → WITH CHECK passes). Same shape allowed a
-- self org_id change (tenant hop).
--
-- Fix: a BEFORE UPDATE trigger that guards the privileged columns role_id/org_id.
-- It ALLOWS: the service role (server-side admin flows; onboarding/invitations are
-- INSERTs, unaffected), unchanged privileged columns (ordinary profile edits), and
-- an admin+ acting within their own org on SOMEONE ELSE's row (legitimate user
-- management, e.g. team-admin role change). It BLOCKS: any non-admin changing
-- role_id/org_id, and ANYONE (including admins) changing their OWN role_id/org_id.
-- Additive + idempotent.
-- ============================================================================

create or replace function public.users_block_privileged_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side/service-role: unrestricted (onboarding, invitations, admin tools).
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Privileged columns unchanged → ordinary self/profile edit is fine.
  if new.role_id is not distinct from old.role_id
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;

  -- Privileged columns ARE changing: only an admin+, within their own org,
  -- acting on a DIFFERENT user's row may do so. No self-escalation, ever.
  if public.has_min_role('admin')
     and old.org_id = public.current_org_id()
     and old.id <> auth.uid() then
    return new;
  end if;

  raise exception 'users: changing role_id/org_id requires admin privileges and is not permitted on your own row'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_users_block_privileged_self_update on public.users;
create trigger trg_users_block_privileged_self_update
  before update on public.users
  for each row execute function public.users_block_privileged_self_update();
