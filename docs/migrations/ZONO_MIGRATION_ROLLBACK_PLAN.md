# ZONO — Migration Rollback Plan

All recovery changes are additive/forward and safe on both clean and production databases.

- **Bootstrap script / CI:** no DB effect on production; rollback = remove the script.
- **Fix 2 (`gin_trgm_ops` qualification):** the index uses `create index if not exists`; on production it already exists → the qualified statement is a no-op. Rollback = revert the one-line qualification (no data effect).
- **Fix 3 (enum idempotency guard):** additive guard only; rollback = revert.
- **Fix 4 (orphan-table migrations):** `create table if not exists` — on production the table already exists → no-op; on a clean DB it creates the missing table. Rollback = `drop table` only on environments where it was newly created (never on prod, where it predates the migration).
- **`tier1_rls_hardening` no-op:** no DB effect; rollback = restore the prior file (not recommended — it was buggy).
- **Wave-1 `persons`/`import` migrations:** additive tables + nullable columns; rollback = drop the new tables + `person_id` columns (originals intact).
- **68 undeployed migration-only tables:** deploying them to production is additive (`create table if not exists`); rollback = drop the newly-created tables (they hold no production data today).

No step drops or rewrites existing production objects/data. Every forward fix is idempotent.
