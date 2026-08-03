# ZONO — Wave 0/1 Patch Manifest

`git apply --stat` + `--check` on `zono-wave0-wave1.patch`: **26 files, 1369 insertions, 0 modifications, 0 deletions, 0 renames.** `--check` = OK. Fully additive; no file outside the approved Wave 0/1 scope; no production runtime impact from landing the code/docs (migrations are separate files that must be applied deliberately on staging).

| Path | Type | +/M | Purpose | Runtime impact | DB impact | Safe to land pre-staging? | Prod impact on deploy? | Rollback |
|---|---|---|---|---|---|---|---|---|
| src/lib/identity/resolution.ts (+test) | code+test | + | dedup gate | none until called | none | yes | none (unused until wired) | delete file |
| src/lib/import/validation.ts (+test) | code+test | + | import row validation | none until called | none | yes | none | delete file |
| src/lib/security/org-scope.ts (+test) | code+test | + | write authz boundary | none until called | none | yes | none | delete file |
| src/lib/security/file-access.ts (+test) | code+test | + | document authz + upload validation | none until called | none | yes | none | delete file |
| supabase/migrations/20261001120000_persons_identity_additive.sql | migration | + | persons/person_* additive | only when applied | additive tables+RLS | yes (file only) | **none unless applied** | drop tables/cols |
| supabase/migrations/20261001121000_import_pipeline_additive.sql | migration | + | import_* additive | only when applied | additive tables | yes | none unless applied | drop tables |
| supabase/migrations/20261001122000_private_document_buckets.sql | migration | + | privatize buckets | **breaks public URLs when applied** | bucket flag + policies | ⚠️ NO — needs signed-URL read path first | none unless applied | re-public + restore policy |
| supabase/migrations/20261001123000_tier1_rls_hardening.sql | migration | + | Tier-1 RLS | only when applied | RLS policies (idempotent) | yes (file only) | none unless applied | drop policies |
| docs/security/*, docs/crm/* (19) | documentation | + | plans/registries/reports | none | none | yes | none | delete file |

**Unexpected scope:** none. Every file is Wave 0 (security) or Wave 1 foundation (identity/import). No code path is invoked until explicitly wired, so landing the patch is inert at runtime; the two migrations with production impact (`_private_document_buckets`, and any RLS/persons apply) are **not** run by landing the patch.
