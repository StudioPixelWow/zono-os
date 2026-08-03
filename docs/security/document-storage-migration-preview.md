# Document Storage Migration — Preview (NOT APPLIED)

- **Affected buckets:** `documents`, `property-media`, `zono-marketing-assets` (public → private).
- **Affected file count:** to be counted on staging (`select bucket_id, count(*) from storage.objects group by 1`); production not queried in this phase. DB rows referencing files: `documents` (3), `property_media` (20), `document_versions` (3) at audit time.
- **Old access mode:** public bucket + `getPublicUrl` (unauthenticated, permanent).
- **New access mode:** private bucket + org-scoped RLS read + short-lived signed URLs issued after server-side permission check.
- **Expected downtime:** none for upload; **read path must be swapped first** (deploy signed-URL helper) before flipping buckets, else existing links break.
- **Compatibility plan:** (1) deploy `getAuthorizedDocumentUrl` + switch UI to it; (2) then apply the privatize migration; (3) re-issue any embedded links.
- **Invalid references:** rows whose `file_url` points to a now-private path must be migrated to store the storage `path` (not a public URL) and resolve via the helper.
- **Risk of previously-shared public URLs:** any public URL shared/emailed before privatization remains a copy of the object path; treat as potentially exposed — rotate/re-key sensitive documents if warranted.
- **Rollback:** set buckets `public=true` + restore the public-read policy (SQL in the migration header).
