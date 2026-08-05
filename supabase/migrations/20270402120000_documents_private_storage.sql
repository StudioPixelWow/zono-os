-- ============================================================================
-- ZONO — Documents bucket: PRIVATE + org-scoped signed access (Epic 3 · Part 13)
-- ----------------------------------------------------------------------------
-- The `documents` bucket previously served SENSITIVE deal documents via
-- permanent PUBLIC URLs (storage_buckets bootstrap created it with public=true
-- and a public SELECT policy). That exposes contracts / IDs / financials to
-- anyone with the URL. This migration makes the bucket PRIVATE and restricts
-- reads to authenticated members of the OWNING org (first path segment = org id,
-- same convention as the existing org_insert/update/delete policies). Access now
-- happens only through short-lived signed URLs minted server-side
-- (src/lib/documents/service.ts → getDocumentSignedUrl).
--
-- Idempotent + privilege-guarded (mirrors 20260726120000_storage_buckets.sql):
-- if the runner cannot touch the storage schema, flip the `documents` bucket to
-- Private in the Supabase dashboard and add the org SELECT policy there.
--
-- Backward compatibility: existing rows that still carry a legacy public
-- `file_url` keep opening via that URL (historical assets); NEW uploads store
-- only `storage_path` and are served via signed URLs. No new object is public.
-- ============================================================================

do $$
begin
  -- 1) Flip the bucket to private (no effect if it does not exist yet).
  update storage.buckets set public = false where id = 'documents';

  -- 2) Remove the blanket public-read policy on the documents bucket.
  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'documents_public_select') then
    drop policy documents_public_select on storage.objects;
  end if;

  -- 3) Org-scoped authenticated read so the server (user JWT) can mint signed
  --    URLs for its own org's objects only. Cross-org reads are denied.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'documents_org_select') then
    execute
      'create policy documents_org_select on storage.objects for select to authenticated '
      || 'using (bucket_id = ''documents'' and (storage.foldername(name))[1] = public.current_org_id()::text)';
  end if;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped documents private-storage hardening (insufficient privilege) — set the documents bucket to Private and add an org-scoped SELECT policy in the Supabase dashboard.';
end $$;
