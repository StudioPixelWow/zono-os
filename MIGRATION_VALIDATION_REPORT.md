# MIGRATION_VALIDATION_REPORT

_Phase 11 · P0.1 + P0.2 + P0.3 — migration chain validation after hardening._
_Migrations directory: `supabase/migrations/` — **92 files** (91 prior + 1 new storage-buckets)._

## 1. Duplicate timestamp — RESOLVED ✅
- **Before:** `20260718120000` appeared twice (`creative_qa_engine.sql` + `distribution_engine.sql`) → non-deterministic ordering / `supabase db push` failure on a fresh project.
- **Fix:** `git mv 20260718120000_distribution_engine.sql → 20260718130000_distribution_engine.sql`.
- **Order preserved:** distribution_engine now sorts **after** `20260718120000_creative_qa_engine` and **before** the rest of the distribution chain (`20260719120000_distribution_infrastructure`, `…120000_distribution_phase3`, `…distribution_provider`, `…distribution_comments_phase7`). Logical dependency order is intact.
- **Verification:** `ls | sed 's/_.*//' | sort | uniq -d` → **empty** (no duplicate version prefixes remain).

## 2. Chain validation
- **Total migrations:** 92, all with unique version prefixes.
- **Duplicate table creation:** none. Scanned all `create table [if not exists] public.<name>` (291 statements) → `uniq -d` returned **zero** duplicates. No table is created twice across migrations.
- **Orphan tables:** none found — every table referenced by a repository has a creating migration in the chain.
- **Missing dependency:** none structurally — extension/helper/enum migrations precede the tables that use them (the chain was authored in dependency order and validated against Postgres in earlier phases via replay).
- **Idempotency note:** older feature migrations use bare `create table public.x` (not `if not exists`). This is correct for a **fresh** `db push` (each runs once). For a DB where some were already applied manually, use Supabase migration repair rather than re-running — do not re-run a bare-create migration against an existing table.

## 3. Storage buckets — FIXED ✅
Audit (Phase 10) flagged that buckets were not created by migration. Verified the **real** bucket ids used by app code:

| Bucket | Used by | Public URLs? | Created by migration |
|---|---|---|---|
| `property-media` | `src/lib/properties/media.ts` | yes (`getPublicUrl`) | **NEW** `20260726120000_storage_buckets.sql` |
| `documents` | `src/lib/documents/upload.ts` | yes (`getPublicUrl`) | **NEW** `20260726120000_storage_buckets.sql` |
| `zono-marketing-assets` | `src/lib/creative-studio/assets.ts`, `src/lib/brand-identity/upload.ts` | yes | **NEW** `20260726120000_storage_buckets.sql` |
| `creative-references` | `creative-dna` flow | no | already `20260723120000_creative_dna_system.sql` |

- New migration creates the 3 missing buckets `on conflict (id) do nothing` (safe if they already exist), with: **public SELECT** (these serve public URLs), and **authenticated org-scoped** INSERT/UPDATE/DELETE checking `(storage.foldername(name))[1] = public.current_org_id()`. Confirmed all three upload helpers write paths beginning with `${orgId}/…`, so the org-segment policy matches real usage.
- Privilege-guarded (`exception when insufficient_privilege` → notice), mirroring the existing creative-references pattern; if the runner can't touch the storage schema, create the buckets in the dashboard.

## Net
The migration chain is now **clean for a fresh `supabase db push`**: no duplicate versions, no duplicate table creation, no orphan tables, and the storage buckets every upload path needs are created idempotently. The only operational caveat remains applying the **full history** (including the late legal/distribution-connections migrations) to the live DB.
