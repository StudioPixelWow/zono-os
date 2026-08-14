-- ============================================================================
-- ZONO — P7.2C operatingAreas table authority. STATUS: PROPOSED — NOT APPLIED.
-- Closes the direct-PostgREST bypass of the operatingAreas guard: an authenticated
-- org member could INSERT/UPDATE user_operating_localities rows directly (RLS
-- policies user_op_localities_insert/update/delete permit it), adding areas beyond
-- the plan cap and skipping create_operating_area_guarded entirely.
--
-- AUDIT (why safe): EVERY app write to user_operating_localities is SERVICE-ROLE —
--   • operating-areas/service.ts  → createServiceRoleClient() (add/update/primary/enable/disable/sync)
--   • operatingLocalitiesRepository.setUserOperatingLocalities → createServiceRoleClient()
--   • onboarding                  → same (service-role)
-- No app flow writes this table as `authenticated`; reads DO (listAreasFor uses the
-- authenticated client) so SELECT is kept. Mirrors the P7.2B org_plans fix.
--
-- DESIGN: drop the authenticated WRITE policies; revoke write grants from
-- authenticated + anon; keep SELECT for authenticated. service_role/postgres bypass
-- RLS and keep grants → the guarded RPC and all legitimate server writes still work.
-- Additive/hardening only; no customer-data change; no destructive schema change.
-- ============================================================================

drop policy if exists user_op_localities_insert on public.user_operating_localities;
drop policy if exists user_op_localities_update on public.user_operating_localities;
drop policy if exists user_op_localities_delete on public.user_operating_localities;

revoke insert, update, delete on public.user_operating_localities from authenticated, anon;

-- (user_op_localities_select stays; authenticated retains SELECT of its own rows.)

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- grant insert, update, delete on public.user_operating_localities to authenticated;
-- create policy user_op_localities_insert on public.user_operating_localities for insert to authenticated with check (user_id = auth.uid());
-- create policy user_op_localities_update on public.user_operating_localities for update to authenticated using (user_id = auth.uid());
-- create policy user_op_localities_delete on public.user_operating_localities for delete to authenticated using (user_id = auth.uid());
