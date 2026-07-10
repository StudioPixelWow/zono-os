-- ============================================================================
-- ZONO — P0 SECURITY FIXES (run in Supabase SQL Editor)
-- Idempotent + safe to re-run. Closes 3 Critical cross-tenant RLS gaps found in
-- the persistence audit (docs/PERSISTENCE_AUDIT.md).
--   P0-1  storage.objects  — org-path isolation on write/delete (6 QA1 buckets)
--   P0-2  distribution_provider_connections — per-user (Facebook token) boundary
--   P0-3  whatsapp_accounts — per-user (WhatsApp session) boundary
-- Helpers used: public.current_org_id(), public.has_min_role() (already exist).
-- Reminder: service-role writes bypass RLS; these policies govern the
-- authenticated (browser) client only.
-- ============================================================================

-- ── P0-1 · STORAGE ──────────────────────────────────────────────────────────
-- Requires that direct authenticated uploads to these 6 buckets use a
-- "<org_id>/..." path prefix. Bulk/service-role writes are unaffected.
drop policy if exists qa1_auth_insert on storage.objects;
create policy qa1_auth_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists qa1_auth_update on storage.objects;
create policy qa1_auth_update on storage.objects for update to authenticated
  using (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists qa1_auth_delete on storage.objects;
create policy qa1_auth_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- ── P0-2 · distribution_provider_connections (Facebook per-user) ─────────────
drop policy if exists "distribution_provider_connections_qa1_read" on public.distribution_provider_connections;
drop policy if exists "distribution_provider_connections_select"   on public.distribution_provider_connections;
create policy "distribution_provider_connections_select"
  on public.distribution_provider_connections for select to authenticated
  using (org_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_insert" on public.distribution_provider_connections;
create policy "distribution_provider_connections_insert"
  on public.distribution_provider_connections for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent')
              and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_update" on public.distribution_provider_connections;
create policy "distribution_provider_connections_update"
  on public.distribution_provider_connections for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent')
         and (user_id is null or user_id = auth.uid()))
  with check (org_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_delete" on public.distribution_provider_connections;
create policy "distribution_provider_connections_delete"
  on public.distribution_provider_connections for delete to authenticated
  using (org_id = public.current_org_id()
         and (user_id is null or user_id = auth.uid() or public.has_min_role('manager')));

-- ── P0-3 · whatsapp_accounts (WhatsApp session per-user; col = organization_id)
drop policy if exists "whatsapp_accounts_qa1_read" on public.whatsapp_accounts;
drop policy if exists "whatsapp_accounts_select"   on public.whatsapp_accounts;
create policy "whatsapp_accounts_select"
  on public.whatsapp_accounts for select to authenticated
  using (organization_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_insert" on public.whatsapp_accounts;
create policy "whatsapp_accounts_insert"
  on public.whatsapp_accounts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent')
              and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_update" on public.whatsapp_accounts;
create policy "whatsapp_accounts_update"
  on public.whatsapp_accounts for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent')
         and (user_id is null or user_id = auth.uid()))
  with check (organization_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_delete" on public.whatsapp_accounts;
create policy "whatsapp_accounts_delete"
  on public.whatsapp_accounts for delete to authenticated
  using (organization_id = public.current_org_id()
         and (user_id is null or user_id = auth.uid() or public.has_min_role('manager')));

-- ============================================================================
-- END P0. After running, verify with:
--   select policyname, cmd, qual from pg_policies
--   where tablename in ('objects','distribution_provider_connections','whatsapp_accounts')
--   order by tablename, cmd;
-- ============================================================================
