# ZONO — Performance Report (live advisor)

Source: Supabase Performance Advisor on `tlrefajhyrqnjtmimaos` (zono-dev). These are static/plan-level findings on the live schema (no load test — Phase 5 app/API/latency timing needs a running staging app, not available here).

## Findings (counts, WARN/INFO)
- **Unindexed foreign keys: 435** — FKs without a covering index; risk on joins and cascade deletes at scale. (lint 0001)
- **Unused indexes: 831** — indexes never used; write-amplification + storage bloat. Review before prod. (lint 0005)
- **Multiple permissive policies: 384** — tables with overlapping permissive RLS policies for the same role/action; each is evaluated per query. Consolidate. (lint 0006)
- **Auth RLS initplan: 68** — RLS policies call `auth.<fn>()`/`current_setting()` per-row; wrap as `(select auth.uid())` to evaluate once. Meaningful on large tables. (lint 0003)
- **Duplicate indexes: 5** — identical indexes; drop one each. (lint 0009)
- **auth_db_connections_absolute: 1** — connection headroom advisory.

Total advisor lints: ~1724 security+performance (INFO 1267 / WARN 457).

## Not measured (no runtime)
Page load, API latency, DB query timing, matching-engine time, AVM, creative generation latency, large-list render, bulk-action throughput — all require the running app under load. Deferred to staging.

## Assessment
No fatal performance defect proven, but a real pre-prod hardening backlog (esp. the 435 unindexed FKs and 68 auth_rls_initplan). Not a staging blocker on its own; a production blocker until triaged.
