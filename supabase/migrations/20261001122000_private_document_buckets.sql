-- ============================================================================
-- ZONO Wave 0 — Privatize sensitive document storage (PREVIEW, NOT YET APPLIED).
-- Confirmed risk: 'documents','property-media','zono-marketing-assets' were
-- created public=true with a 'select to public' policy → legal/ID/contract files
-- world-readable by URL. This migration flips them private and replaces the
-- public-read policy with an org-scoped authenticated-read policy. Access is then
-- via short-lived SIGNED URLs generated only after server-side record-permission
-- checks (see src/lib/security/file-access design).
--
-- ⚠️ OPERATIONAL: flipping public→private breaks any previously-shared public URL.
-- Do NOT apply before the document-storage-migration-preview is reviewed and a
-- signed-URL read path is deployed. See docs/security/ZONO_DOCUMENT_STORAGE_AUDIT.md.
-- Rollback: set buckets public=true again + restore the public read policy.
-- ============================================================================

update storage.buckets set public = false
 where id in ('documents','property-media','zono-marketing-assets');

-- Remove world-readable policy (idempotent).
drop policy if exists "Public read" on storage.objects;
drop policy if exists "documents public read" on storage.objects;

-- Org-scoped authenticated read: the first path segment must equal the caller's org.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='zono_org_scoped_read') then
    create policy zono_org_scoped_read on storage.objects
      for select to authenticated
      using (
        bucket_id in ('documents','property-media','zono-marketing-assets')
        and (storage.foldername(name))[1] = public.current_org_id()::text
      );
  end if;
  -- Writes remain org-scoped (unchanged if already present).
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='zono_org_scoped_write') then
    create policy zono_org_scoped_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('documents','property-media','zono-marketing-assets')
        and (storage.foldername(name))[1] = public.current_org_id()::text
      );
  end if;
end $$;
