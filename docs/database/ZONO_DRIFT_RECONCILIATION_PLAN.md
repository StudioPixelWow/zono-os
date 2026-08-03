# ZONO — Drift Reconciliation Plan

Staged, **do not apply**. Additive/forward-safe; production data never rewritten.

## Stage 1 — Recoverability (P0)
- **Add migrations for the 3 orphan tables** (`approval_decisions`, `journey_notes`, `user_ui_preferences`) — `create table if not exists` matching the production definitions (dump prod DDL, commit as a migration). Risk: low (idempotent). Rollback: drop only where newly created. Testing: clean replay includes them; code path using `journey_notes` works on a fresh DB. Effort: S.

## Stage 2 — Bootstrap + replay fix (P0)
- Commit `scripts/ci-migration-replay.sh` as CI; apply the `gin_trgm_ops` qualification + enum idempotency (from ZONO_REPLAY_FIXES). Risk: low. Rollback: revert. Effort: S. (Delivered in the migration-recovery patch.)

## Stage 3 — Column drift (P1)
- **`deals` type mismatch (bigint vs integer):** decide the canonical type. Production is `bigint` (safer for currency); the migrations are `integer`. Add a reviewed forward migration `alter table deals alter column commission_amount type bigint, alter column value type bigint` (no-op on prod, upgrades a fresh DB). Risk: low (widening). Rollback: not needed (widening is safe). Effort: S.
- **`properties.formatted_address` / `agencies.*7 cols`:** these exist in migrations but not prod → they are part of undeployed migrations. Resolve by Stage 4 (deploy) — no separate action.

## Stage 4 — Undeployed migrations (P1, product decision)
- **71 migration-only tables** (meta_workspace + copilot/creative/agency/zi): decide **deploy vs remove**. If the features are live/planned → deploy the migrations to production (additive, `if not exists`). If cancelled → remove the migrations from the repo. This is a product/deployment decision, not engineering-only. Risk: medium (adds tables to prod). Rollback: drop newly-created tables (no data today). Effort: M.

## Stage 5 — Type generation (P2)
- Regenerate `src/lib/supabase/types.ts` from the authoritative schema so all 541 tables are typed (removes the 163-table `as never` gap and the 12 stale entries). Risk: low. Rollback: revert file. Effort: M (may surface type errors where `as never` masked mismatches — that's the point).

## Acceptance
After Stages 1–5, A ≡ B ≡ C ≡ D and every difference is explained/closed.
