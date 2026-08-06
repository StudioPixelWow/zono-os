# DB-Backed Orchestration Store Report

`content-orchestration/supabase-orchestration-store.ts` — `DbOrchestrationStore` implements the `OrchestrationStore` contract over a narrow `StoreClient` seam (`store-client.ts`). Supabase specifics live in `makeSupabaseStoreClient` (real, server-only, production-usable); `InMemoryStoreClient` backs deterministic tests. The in-memory adapter used by `runtime.qa.ts` is unchanged.

Persists (org-scoped, org id from trusted context — never the client): outputs (+ lineage columns), usage, publications, idempotency keys, and (schema) performance. Optimistic locking via `updateOutputStateChecked` (version predicate → 0 rows ⇒ `OptimisticLockConflict`).

## Migration
`20270401120000_creative_runtime_persistence.sql` adds output lineage columns + `creative_publications` + `creative_performance` + `creative_idempotency` (org-scoped, RLS, FKs, idempotency uniques). **Migration replay 210/210.**

## Tests
`db-store.qa.ts` — **13 assertions pass**: persistence via DB store, usage + lineage persisted, idempotent generation (no duplicate row), **Beta cannot read Alpha output/publication by direct id**, publication persisted + confirmed, no duplicate publication, cross-org publish denied, **optimistic-lock stale-version rejected / correct-version applied**, generation preserved after publish permanent failure.

Not certified here: live Supabase integration (no local Supabase stack / Docker in this sandbox) — the adapter code is complete and type-clean; its logic is proven against the in-memory StoreClient.
