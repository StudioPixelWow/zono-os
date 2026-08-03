# ZONO — Replay Fixes

## Fix 1 (primary) — documented bootstrap
`scripts/ci-migration-replay.sh` provisions roles + auth/storage schemas + extensions in `extensions` + `search_path` including `extensions` + auth/storage shims, then replays all migrations. Proven 209/209. Any clean DB/CI/new branch must apply this bootstrap (Supabase branches must ensure `extensions` is on the migration-runner search_path).

## Fix 2 — `gin_trgm_ops` (migration #11, safe forward fix)
Replace the unqualified operator class with the schema-qualified form so it resolves regardless of search_path:
```sql
-- before: using gin (search_col gin_trgm_ops)
-- after:  using gin (search_col extensions.gin_trgm_ops)
```
Backward-compatible: the index uses `create index if not exists`, so re-running on an already-migrated DB is a no-op. Apply to every `gin_trgm_ops` / `gist_trgm_ops` reference in the chain (grep before applying).

## Fix 3 — enum idempotency (migration #1, optional)
Guard enum creation so partial re-runs don't fail:
```sql
do $$ begin create type org_plan as enum (...); exception when duplicate_object then null; end $$;
```

## Fix 4 — orphan tables
Add reviewed `create table if not exists` migrations for `approval_decisions`, `journey_notes`, `user_ui_preferences` (currently in prod with no migration provenance) so a fresh rebuild includes them.

## Fix 5 (this patch) — corrected `tier1_rls_hardening`
The Wave-0 `20261001123000_tier1_rls_hardening.sql` assumed `organization_id` and failed at runtime (`column organization_id does not exist`; the codebase uses `org_id`) AND was redundant (Tier-1 tables already have RLS+policies). It is now a documented **no-op**.

Note: the Wave-1 `persons`/`import` additive migrations use `organization_id` for their NEW tables; for codebase consistency they should be aligned to `org_id` (or keep `organization_id` with matching policies — both work; alignment is cleaner). Flagged, not blocking.
