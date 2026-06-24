-- ============================================================================
-- ZONO — Storage buckets bootstrap (production hardening, Phase 11 · P0.3)
-- ----------------------------------------------------------------------------
-- Ensures the storage buckets the app uploads to actually exist on a fresh
-- Supabase project, so property media / documents / marketing assets uploads
-- never fail with "bucket not found". Idempotent (on conflict do nothing) and
-- privilege-guarded — if the runner cannot touch the storage schema, create the
-- buckets in the dashboard (Storage → New bucket) with the same ids.
--
-- Real bucket ids used by the app (verified in code):
--   property-media        → src/lib/properties/media.ts        (public URLs)
--   documents             → src/lib/documents/upload.ts        (public URLs)
--   zono-marketing-assets → src/lib/creative-studio/assets.ts,
--                           src/lib/brand-identity/upload.ts   (public URLs)
--   creative-references   → already created in 20260723120000_creative_dna_system.sql
--
-- Object paths are org-scoped: the FIRST path segment is the org id
-- (e.g. "<orgId>/<propertyId>/<file>"), so write policies check foldername[1].
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('property-media', 'property-media', true),
  ('documents', 'documents', true),
  ('zono-marketing-assets', 'zono-marketing-assets', true)
on conflict (id) do nothing;

do $$
declare
  b text;
  buckets text[] := array['property-media', 'documents', 'zono-marketing-assets'];
begin
  foreach b in array buckets loop
    -- Public read (these buckets serve public URLs used in listings / sites / creatives).
    if not exists (select 1 from pg_policies where schemaname='storage' and policyname = b || '_public_select') then
      execute format(
        'create policy %I on storage.objects for select to public using (bucket_id = %L)',
        b || '_public_select', b);
    end if;
    -- Authenticated, org-scoped writes: first path segment must equal the caller''s org.
    if not exists (select 1 from pg_policies where schemaname='storage' and policyname = b || '_org_insert') then
      execute format(
        'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] = public.current_org_id()::text)',
        b || '_org_insert', b);
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and policyname = b || '_org_update') then
      execute format(
        'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = public.current_org_id()::text)',
        b || '_org_update', b);
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and policyname = b || '_org_delete') then
      execute format(
        'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = public.current_org_id()::text)',
        b || '_org_delete', b);
    end if;
  end loop;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped storage.objects policies (insufficient privilege) — create the buckets + policies in the Supabase dashboard.';
end $$;
