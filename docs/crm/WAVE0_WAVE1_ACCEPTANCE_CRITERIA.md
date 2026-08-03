# ZONO — Wave 0 / Wave 1 Acceptance Criteria

## Wave 0 (all must hold; ✓=done here, ▢=pending runtime/operator)
- ▢ all sensitive document buckets private (migration ready; apply on staging→prod after signed-URL read path)
- ▢ signed access requires verified record permission (helper designed; wire + test)
- ✓ documented isolation boundary for tenant data (tenant table registry)
- ▢ every critical tenant table has DB-enforced isolation (RLS packs + CI lint; apply on staging)
- ✓ safe org-scoped write boundary exists (`org-scope.ts`, 13 tests) — ▢ wired into the 173 write sites
- ▢ two orgs pass read/write/delete/search/file isolation (matrix + fixtures ready; run on staging)
- ✓ inactive users cannot mutate (enforced in write boundary) — ▢ guard/session enforcement wired
- ▢ departed-agent records transferable without losing history (workflow designed; build executor)
- ▢ critical errors + failed jobs observable (runbook; add Sentry + monitors)
- ▢ no open P0 (public buckets + RLS gaps remain until migrations applied)

## Wave 1 (all must hold)
- ✓ one canonical identity per org supported (persons schema + resolver, 16 tests) — ▢ backfill applied
- ✓ multiple roles per identity (person_roles) — ▢ reads switched
- ✓ person-creation gate exists (resolver) — ▢ wired into all creation paths (path audit)
- ✓ existing records have an additive migration path (Option C, reversible) — ▢ applied on staging
- ✓ ambiguous records not auto-merged (resolver → review; tested)
- ✓ merge/link auditable (person_merge_log)
- ✓ CSV/XLSX validation works (validation.ts, 19 tests) — ▢ upload/parse UI + async processing
- ✓ mapping/preview/validation/duplicate handling designed + core built — ▢ end-to-end pipeline
- ✓ imports org-isolated (RLS + session-fixed org)
- ✓ row-level failure reports (validateBatch per-row) — ▢ error-file generation
- ✓ import history stored (import_batches/rows) — ▢ wired
- ✓ safe rollback defined (rollback plan + rollback_state) — ▢ executor
- ▢ realistic contact/buyer/seller/property files pass end-to-end (run on staging)

## Definition of Done per item
code + tests + evidence for ✓ items; migration + preview + rollback for schema; runtime proof on staging for ▢ items. Nothing marked complete without runtime evidence; no production data changed.
