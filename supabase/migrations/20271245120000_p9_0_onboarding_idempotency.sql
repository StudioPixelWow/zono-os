-- ============================================================================
-- P9.0 — ONBOARDING IDEMPOTENCY GUARD (additive, non-destructive).
-- ----------------------------------------------------------------------------
-- completeOnboarding (self-serve trial path) is a sequence of service-role writes
-- with no server-side idempotency: a concurrent double-submit / retry could create
-- TWO organizations (the second orphaned — seeded roles, no owner user). This adds
-- the smallest safe DB primitive to make org creation idempotent PER CREATING USER:
--
--   organizations.created_by_user_id  + a PARTIAL UNIQUE INDEX (WHERE NOT NULL).
--
-- The self-serve path stamps created_by_user_id = the authenticated owner. A second
-- concurrent org insert by the same user then violates the unique index; the
-- repository catches it and returns the already-created org (one org, one owner).
-- The paid webhook path leaves the column NULL (each paid org has a fresh auth user
-- and is already idempotent via draft.orgId), so the partial index does not affect
-- it. NULLable + partial → existing rows unaffected; no backfill; no data rewrite.
--
-- STRICT: additive only. No RLS/grant change (organizations already has no
-- authenticated INSERT policy; service_role is the sole writer). No Pixel/RE-MAX
-- change; creates no rows.
-- ============================================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_created_by_user_uq
  ON public.organizations (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
