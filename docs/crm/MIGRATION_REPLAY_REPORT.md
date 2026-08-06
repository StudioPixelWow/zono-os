# Migration Replay Report (Phase 5)

## Status: NOT EXECUTED on a fresh staging DB (no staging project available to this session)
A true clean-room replay requires provisioning a dedicated staging Supabase project (a billable action requiring the owner's approval) or a local Postgres with faithful Supabase stubs (auth/storage schemas, `anon/authenticated/service_role` roles, extensions). Neither was created without authorization. This report therefore certifies migration INTEGRITY statically and defines the exact replay to run on staging.

## Static integrity (verified here)
- 214 migration files; **0 timestamp collisions**; all `^\d{14}_`. Canonical order is deterministic.
- Outstanding (undeployed) migrations are **additive + idempotent**: `create table if not exists`, `add column if not exists`, and RLS blocks wrapped in `do $$ … exception when insufficient_privilege`. Re-application is a no-op — safe for both a clean replay and a production catch-up.
- Dependency order holds: Epic 3 (`20270402–05`) and the Meta 6.9 batch reference only objects created earlier in the sequence.

## The replay to run on staging (expected: 100% success)
```
supabase link --project-ref <STAGING_REF>
supabase db reset            # empty DB
# apply all 214 migrations in order; capture pass/fail per file
supabase db push             # or ordered psql -f for each file
```
Success criteria: every migration applies with no error, no manual SQL, no skipped file; final `schema_migrations` lists all 214; a repo↔staging schema diff is empty.

## Why the LIVE DB cannot be the baseline
`supabase_migrations.schema_migrations` on live tracks 10 versions but the DB holds 476 tables — it was built out-of-band. A replay must start from an EMPTY staging DB, not from live, to be reproducible.
