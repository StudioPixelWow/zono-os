-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 STORAGE BUCKETS. STRICTLY ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 finding that storage buckets were provisioned by hand and not
-- reproducible from code. Creates the canonical buckets with `on conflict do
-- nothing` (safe if a bucket was already created in the dashboard) and attaches
-- least-privilege object policies:
--   • public buckets  → public READ, authenticated WRITE
--   • private buckets → authenticated READ + WRITE (org isolation is enforced by
--     an `<org_id>/...` path convention in app code + service-role writes)
-- No public WRITE anywhere. Re-runnable: drop policy if exists guards policies.
-- NOTE: requires the `storage` schema (present on all Supabase projects).
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('creative-references', 'creative-references', false),
  ('property-media',      'property-media',      true),
  ('documents',           'documents',           false),
  ('logos',               'logos',               true),
  ('agent-photos',        'agent-photos',        true),
  ('office-assets',       'office-assets',       true),
  ('public-site-media',   'public-site-media',   true)
on conflict (id) do nothing;

-- ── Public READ for public-facing buckets ───────────────────────────────────
drop policy if exists qa1_public_read on storage.objects;
create policy qa1_public_read on storage.objects for select to public
  using (bucket_id in ('property-media','logos','agent-photos','office-assets','public-site-media'));

-- ── Authenticated READ for private buckets ──────────────────────────────────
drop policy if exists qa1_private_read on storage.objects;
create policy qa1_private_read on storage.objects for select to authenticated
  using (bucket_id in ('creative-references','documents'));

-- ── Authenticated WRITE (insert/update/delete) for all managed buckets ──────
-- Actual bulk writes run under service_role (BYPASSRLS); this allows direct
-- authenticated uploads where the product needs them. No public write.
drop policy if exists qa1_auth_insert on storage.objects;
create policy qa1_auth_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media'));

drop policy if exists qa1_auth_update on storage.objects;
create policy qa1_auth_update on storage.objects for update to authenticated
  using (bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media'));

drop policy if exists qa1_auth_delete on storage.objects;
create policy qa1_auth_delete on storage.objects for delete to authenticated
  using (bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media'));
