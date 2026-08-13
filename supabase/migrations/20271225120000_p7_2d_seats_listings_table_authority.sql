-- ============================================================================
-- ZONO — P7.2D seats + monitoredListings table authority. STATUS: PROPOSED.
-- Closes the last direct-PostgREST self-escalation paths: an authenticated org
-- member could INSERT org_invitations / properties rows directly (RLS policies
-- permit it), creating invites/listings beyond the plan cap and skipping the
-- guarded RPCs. Mirrors P7.2B (org_plans) and P7.2C (user_operating_localities).
--
-- ⚠ DEPLOYMENT ORDERING (critical): apply this ONLY AFTER the P7.2D application
-- code is deployed. That code moves EVERY legitimate org_invitations/properties
-- write to the service-role client with server-side authorization (org derived
-- from session; role via has_min_role; writes scoped `.eq(org_id, sessionOrg)`).
-- Until that code is live, the deployed SHADOW-mode paths still write via the
-- authenticated client — revoking first would break invite/property creation for
-- SHADOW orgs (incl. new-org onboarding). Deploy code → then apply this.
--
-- AUDIT (writers moved to service-role by the P7.2D code):
--   org_invitations: createInvitation (SHADOW insert), cancelInvitation.
--     accept/expire + platform invite/resend were already service-role.
--   properties: createProperty (insert+enrich), createDraftProperty, updateProperty,
--     setPropertyStatus/archive, saveDraft, markPublished, promoteExternalListing,
--     syncLegacyPrimarySeller, syncPropertyOnDealWon. Draft cleanup/discard were
--     already service-role. All now service-role + org-scoped.
--
-- DESIGN: drop authenticated WRITE policies; revoke insert/update/delete from
-- authenticated + anon; KEEP SELECT (opl-style) so RLS-scoped reads are unchanged.
-- service_role/postgres bypass RLS + keep grants → guarded RPCs and all server
-- writers keep working. The invitation ACCEPT path already uses service-role, so
-- join/acceptance is unaffected. No SELECT RLS weakened. No broad SECURITY DEFINER
-- RPC granted to customers. Additive/hardening only; no customer-data change.
-- ============================================================================

-- ── org_invitations ─────────────────────────────────────────────────────────
drop policy if exists org_invitations_insert on public.org_invitations;
drop policy if exists org_invitations_update on public.org_invitations;
drop policy if exists org_invitations_delete on public.org_invitations;
revoke insert, update, delete on public.org_invitations from authenticated, anon;

-- ── properties ──────────────────────────────────────────────────────────────
drop policy if exists properties_insert on public.properties;
drop policy if exists properties_update on public.properties;
drop policy if exists properties_delete on public.properties;
revoke insert, update, delete on public.properties from authenticated, anon;

-- (SELECT policies + grants on both tables are intentionally retained.)

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- grant insert, update, delete on public.org_invitations to authenticated;
-- create policy org_invitations_insert on public.org_invitations for insert to authenticated with check (org_id = current_org_id() and has_min_role('manager'));
-- create policy org_invitations_update on public.org_invitations for update to authenticated using (org_id = current_org_id() and has_min_role('manager')) with check (org_id = current_org_id() and has_min_role('manager'));
-- create policy org_invitations_delete on public.org_invitations for delete to authenticated using (org_id = current_org_id() and has_min_role('manager'));
-- grant insert, update, delete on public.properties to authenticated;
-- create policy properties_insert on public.properties for insert to authenticated with check (org_id = current_org_id() and has_min_role('agent'));
-- create policy properties_update on public.properties for update to authenticated using (org_id = current_org_id() and has_min_role('agent')) with check (org_id = current_org_id());
-- create policy properties_delete on public.properties for delete to authenticated using (org_id = current_org_id() and has_min_role('manager'));
