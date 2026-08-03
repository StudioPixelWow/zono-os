# ZONO — Migration Recovery Final Report

## Preserved evidence
The Supabase branch was already deleted, so its internal log was unavailable; the failure was **reproduced deterministically on a clean local Postgres 16** (`scripts/ci-migration-replay.sh`), which is stronger evidence. Captured: first failure + statement + root cause, the required bootstrap, full clean-replay success (209/209), rebuilt-schema metrics, production drift (read-only), and full-schema Wave 0 isolation results.

## First failure
- migration: `20260618092000_israel_localities.sql` (#11)
- statement: `create index ... using gin(... gin_trgm_ops)`
- error: `operator class "gin_trgm_ops" does not exist for access method "gin"`
- root cause: `pg_trgm` in `extensions` schema referenced unqualified → resolves only with `extensions` on `search_path`.

## Additional replay defects
- migration #1 enum creation is **non-idempotent** (no guard) → blocks partial re-runs.
- migrations assume a **Supabase base** (roles, auth/storage schemas, extensions, auth.uid/role/jwt, storage.foldername) — must be bootstrapped on any clean DB.

## Repair strategy
**Strategy B (additive bootstrap/compat) + a narrow, idempotent #11 fix** — never a blind history rewrite. Safe for clean DBs (bootstrap + qualified opclass → 209/209) and for existing production (all fixes are `if not exists`/qualification-only; no drops/rewrites). Undeployed migrations + orphan tables are surfaced for decision, not auto-reconciled.

## Production drift
- total differences: **71 migration-only + 3 production-only**.
- production-only (no provenance, dangerous): `approval_decisions`, `journey_notes`, `user_ui_preferences`.
- migration-only (undeployed to prod): ~71, mostly the `meta_workspace` batch (future-dated) + copilot/creative/agency/zi extras.
- dangerous differences: the 3 orphan tables (fresh rebuild lacks them).
- unresolved decisions: deploy vs remove the 71 undeployed migration tables (product call).
- **correction:** "109 tables without RLS" was wrong — all tables are RLS-enabled.

## Clean replay
- total: 209 · passed: **209** · failures: 0 (with bootstrap) · tables: **541** · functions: 70 · policies: 1,812 · enums: 44 · runtime: seconds · schema validation: matches expected (Tier-1 CRM present + org-scoped).

## Full-schema staging
- created: **yes (local full 541-table rebuild)**; Supabase-branch rebuild pending the committed fix.
- proof not production: local container Postgres, no prod creds, synthetic data only.
- application connection / build / route tests: **not run** (needs app env + server) — follow-up.

## Wave 0 full-schema status
**partially passed** — two-org isolation on the real `buyers` table with production policies PASSED (Alpha 6/leak0, Beta 3/leak0, no-user 0, membership-derived org); document access / deactivation routes / service-role wiring / observability not yet on full schema.

## Wave 1 identity foundation status
**full-schema partially passed** — persons/import migrations apply on the full rebuild; dedup + multi-role proven; gate not wired into all creation paths and import workflow incomplete → NOT full Wave 1 complete.

## Recommendation
**Migration replay repaired, full-schema staging pending.**
Replay is repaired and proven (209/209 with documented bootstrap; the exact fix identified), and a full-schema environment + Wave 0 isolation was demonstrated locally. The remaining step is committing Fix 1+2 and rebuilding a fresh **Supabase** branch to 541 tables (then app-route tests). Do not begin Wave 2.
