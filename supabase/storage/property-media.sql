-- ============================================================================
-- ZONO — Storage bucket for property media
-- ----------------------------------------------------------------------------
-- Run ONCE in the Supabase SQL Editor (buckets live in the `storage` schema and
-- can't be created from a normal migration). Alternatively create the bucket
-- "property-media" via Dashboard → Storage → New bucket (Public), then run only
-- the policies below.
-- ============================================================================

-- 1) The bucket (public read so listing images can render in the app/preview).
insert into storage.buckets (id, name, public)
values ('property-media', 'property-media', true)
on conflict (id) do nothing;

-- 2) Policies on storage.objects, scoped to this bucket.
--    Public read; authenticated users can upload/update/delete within it.
--    (Org-level scoping is enforced on the property_media table rows; files are
--    namespaced by org/property in their path.)
create policy "property_media_public_read"
  on storage.objects for select
  using (bucket_id = 'property-media');

create policy "property_media_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'property-media');

create policy "property_media_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'property-media')
  with check (bucket_id = 'property-media');

create policy "property_media_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'property-media');
