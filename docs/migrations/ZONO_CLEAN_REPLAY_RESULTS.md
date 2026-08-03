# ZONO — Clean Replay Results

Environment: clean Postgres 16.13, empty DB, Supabase bootstrap applied, `scripts/ci-migration-replay.sh`.

| Metric | Value |
|---|---|
| Total migrations | 209 |
| Migrations passed | **209 / 209** |
| Failures (with bootstrap) | 0 |
| First failure WITHOUT bootstrap | #11 `israel_localities` — `gin_trgm_ops` |
| Public base tables produced | **541** |
| Functions (public) | 70 |
| Policies (public) | 1,812 |
| Enums (public) | 44 |
| RLS-enabled tables | **541 (100%)** |
| Tables with NO policy | 13 (all webhook/sync/cache/provider-QA system tables — RLS-on = default-deny) |
| Schema validation | matches expected app schema (Tier-1 CRM tables present with org-scoped policies) |

## Correction to prior audit
The earlier "**109 tables have no RLS**" figure was a **static-grep artifact** and is **wrong**. The clean rebuild shows **all 541 tables RLS-enabled**, with only 13 lacking a policy — and those 13 are non-tenant system tables (default-deny). Tenant CRM tables each carry 5 policies with `org_id = current_org_id()`.
