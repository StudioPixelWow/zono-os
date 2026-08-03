# ZONO — Migration Replay Failure Evidence

## Context
The Supabase branch `wave0-staging` (`xsaihtxeiqofqepcykex`) returned **MIGRATIONS_FAILED** with **0 public tables**. The branch was deleted (cost), so its internal replay log is not retrievable — but the failure was **reproduced locally against a clean Postgres 16** (better evidence: deterministic, inspectable).

## Reproduction environment
Clean PostgreSQL 16.13, empty database, migrations run in repository filename order with `ON_ERROR_STOP=1`. Harness: `scripts/ci-migration-replay.sh`.

## First failure (deterministic)
- **Migration:** `20260618092000_israel_localities.sql` (#11 of 209), line 36.
- **Statement:** a `create index ... using gin (... gin_trgm_ops)` on the localities search column.
- **Error:** `ERROR: operator class "gin_trgm_ops" does not exist for access method "gin"`.
- **Root cause:** `pg_trgm` is installed in the `extensions` schema (Supabase convention), but `gin_trgm_ops` is referenced **unqualified**, so it only resolves if `extensions` is on the session `search_path`. A clean branch/DB without that search_path (or without pg_trgm pre-created) fails here.

## Second-order observation (non-blocking)
- **Migration #1** (`extensions_and_enums.sql`) is **non-idempotent** — `create type ... ` without `if not exists`/guard; re-running on a dirty DB errors (`type "org_plan" already exists`). Harmless on a truly clean DB, but blocks partial re-runs.

## After providing the documented bootstrap → SUCCESS
With the Supabase-compatible bootstrap (roles `anon`/`authenticated`/`service_role`; schemas `auth`/`storage`/`extensions`; extensions in `extensions`; **`search_path` including `extensions`**; `auth.uid()/role()/jwt()`; `storage.buckets/objects/foldername`), **all 209 migrations pass** (209/209).

## Conclusion
The schema **is** reproducible from version control — the branch failure was an **environment/bootstrap gap** (search_path/extensions), not broken migration SQL, plus one narrow SQL fragility (unqualified `gin_trgm_ops`). No secrets included.
