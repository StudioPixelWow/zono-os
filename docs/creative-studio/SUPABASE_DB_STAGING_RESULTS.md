# Supabase DB Staging — Results

## Status: PASSED (executed on the real Supabase project `zono-dev`)
Executed against the live `zono-dev` Supabase project (Postgres 17) via the
Supabase management API, with the owner's explicit authorization to run an
additive migration + a cleaned-up smoke on that development database. All test
rows were tagged `ZONO_SMOKE_` and removed afterward (verified 0 remaining).
No production data was modified.

## Migration (additive) — applied
`creative_runtime_persistence` applied cleanly and idempotently. Post-apply
verification:
- **7** new lineage columns on `zono_quick_creative_outputs`
  (`root_output_id`, `parent_output_id`, `source_brief_version`,
  `source_brand_version`, `refinement_reason`, `private_master_path`,
  `publication_ref`);
- **3** new tables (`creative_publications`, `creative_performance`,
  `creative_idempotency`);
- RLS **enabled** on all three; **7** org-scoped policies present;
- unique constraints present on `creative_publications`.
Dependencies confirmed present first: `organizations`, `current_org_id()`,
`has_min_role()`, `set_updated_at()`.

## Constraint + persistence smoke — 8/8
Run on real Postgres (rolled back cleanly afterward):
- `unique(org_id, idempotency_key)` rejects a duplicate — ✓
- `unique(org_id, output_id, platform)` rejects a duplicate — ✓
- `unique(org_id, publication_id, period)` rejects a duplicate — ✓
- `primary key(org_id, scope, key)` on `creative_idempotency` rejects a duplicate — ✓
- `FK(output_id)` rejects a missing output — ✓
- `check(status in …)` rejects an invalid status — ✓
- publication + performance + idempotency inserts succeed — ✓ (3)

## RLS organization isolation — PASSED
`current_org_id()` resolves `auth.uid() → users.org_id`. With a test publication
owned by org A:
- authenticated as **user A / org A** → the row is **visible (1)**, resolved org = A;
- authenticated as **user B / org B** → the row is **not visible (0)**, resolved org = B.
Cross-organization reads are blocked by real RLS on the real database.

## Cleanup
All `ZONO_SMOKE_` rows deleted; `creative_performance` cascaded via the
publication delete. Verified: 0 publications / 0 performance / 0 idempotency test
rows remaining.

## Still outstanding on this gate
- **Storage signed-access** against the real Supabase Storage bucket — the
  Supabase management API used here does not cover Storage upload/sign, so the
  `SupabasePrivateStorage` live run must be executed from the app/runtime with a
  storage key (see SUPABASE_STORAGE_STAGING_RESULTS.md). The adapter is
  contract-verified (`storage-contract.qa.ts` 24/0).
- **Adapter-level** run of `makeSupabaseStoreClient` (the TypeScript store) end
  to end against staging — the SQL-level guarantees above (schema, constraints,
  RLS, idempotency) are proven; a full adapter pass is the optional next step.

**Result: Supabase staging DB + RLS — PASSED (real project, cleaned up).**
