# ZONO — Document Storage Audit

## Buckets (from migrations + code)
| Bucket | public? | categories | upload | download | risk |
|---|---|---|---|---|---|
| `documents` | **true** | brokerage/exclusivity/legal/identity/mortgage/offers | `documents/upload.ts:21-35` → `getPublicUrl` | `DocumentsView.tsx:204` links `file_url` | **legal/ID leak by URL** |
| `property-media` | **true** | photos/video/floor_plan/tour/document | `property/media.ts:19-44` | public URL | property docs leak |
| `zono-marketing-assets` | **true** | creative assets | creative-studio | public URL | lower sensitivity |

Writes are org-scoped (`foldername[1] = current_org_id()`), but **reads are world-readable**. Unguessable URL is NOT access control. URLs are persisted in `documents.file_url` (may have been shared historically → assume exposed).

## Target architecture
Private buckets → server verifies (authenticated user + active membership + permission on the related record) → issues a **short-lived signed URL** or streams via an authenticated proxy. Validate MIME + size + sanitize filename on upload; store tenant + record ownership metadata; log access to SENSITIVE categories; handle expired-URL + missing-file.

## Delivered
- Migration preview `20261001122000_private_document_buckets.sql` — flips the three buckets private, drops public-read, adds org-scoped authenticated read/write policies (NOT applied).
- File-access helper design: `getAuthorizedDocumentUrl(actor, documentId)` → loads doc, `assertWrite`/read-permission check (org-scope), returns a signed URL with short TTL; refuses arbitrary paths.

## Legacy files
See `document-storage-migration-preview.md`: flipping public→private **breaks previously-shared public URLs**. Do not apply before the signed-URL read path is deployed and the preview is reviewed. Rollback documented.

## Tests to add (on staging)
Org A reads own doc ✓ · Org A cannot read Org B doc ✗ · unauthenticated ✗ · inactive user ✗ · expired signed URL ✗ · path manipulation ✗ · user without record permission ✗ · valid authorized ✓ · deleted record leaves no accessible file ✓.
