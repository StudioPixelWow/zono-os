# ZONO — Migration Repair Decision

## Evidence
- All 209 migrations replay cleanly on an empty DB **given the documented Supabase bootstrap** (209/209).
- The only SQL-level blocker is unqualified `gin_trgm_ops` (#11), which fails when `extensions` is not on the search_path.
- Production is BEHIND the repo (68 migration-only tables never deployed) and has 3 tables with no migration provenance (drift report).
- Historical migrations have already been applied to production; rewriting them blindly is unsafe.

## Chosen strategy: **B (additive bootstrap/compat) + a narrow #11 fix**, NOT a history rewrite.
1. **Bootstrap is documented + scripted** (`scripts/ci-migration-replay.sh`, `scripts/README-migration-replay.md`) so any clean DB / CI / new Supabase branch reproduces the schema. This is the primary fix — it makes replay reproducible without touching applied history.
2. **Narrow forward fix for `gin_trgm_ops`:** qualify the operator class as `extensions.gin_trgm_ops` (or `set local search_path` at the top of the migration). Because the index uses `create index if not exists`, this is backward-compatible on databases where it already applied (skip) and fixes fresh replay. Delivered as a documented fix in `ZONO_REPLAY_FIXES.md`; applying it to the historical file is a reviewed one-line change (safe due to idempotency) — held for approval rather than rewritten unilaterally.
3. **Idempotency guard for #1 enums** (forward, optional): add `if not exists`/`drop type if exists` guard so partial re-runs don't break. Documented, not auto-applied.
4. **Prod-only orphan tables** (`approval_decisions`,`journey_notes`,`user_ui_preferences`): add proper `create table if not exists` migrations so a fresh rebuild includes them (they currently exist in prod with no provenance). Reviewed additive migration.
5. **68 undeployed migration-only tables** (meta_workspace etc.): a product/deployment decision — deploy those migrations to production, or remove them from the repo if the features are cancelled. Not an engineering-only call.

## Why safe for both clean DBs and existing production
Nothing drops/rewrites production objects or data. The bootstrap + narrow idempotent fixes make an empty DB reach the same schema; existing prod (where migrations already ran) is unaffected because the fixes are `if not exists`/qualification-only. The two genuinely divergent areas (undeployed migrations, orphan tables) are surfaced for decision, not auto-reconciled.

## Rejected
- **Strategy A (rewrite history):** rejected as the primary approach — migrations already ran on production; broad rewrites risk two incompatible histories.
- **Strategy D (fix tracking metadata only):** insufficient — the failure has a real schema effect (missing trgm opclass), not just tracking drift.
- **Manual schema recreation:** explicitly forbidden and not done.
