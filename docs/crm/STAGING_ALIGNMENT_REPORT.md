# ZONO CRM 360 — Staging Alignment Report (Phase 4 evidence)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. **Production never touched.**
**Date:** 2026-08-05

This report captures the live evidence gathered after applying the 21 READY migrations. Every figure below was read from the live database via Supabase MCP after the applies completed.

## 1. Migration tracking

| Metric | Before | After |
|---|---|---|
| `supabase_migrations.schema_migrations` rows | 14 | **35** (+21) |

Every `apply_migration` call returned `{"success":true}`. No retries were needed; no migration produced a syntax or dependency error.

## 2. Table & RLS census

| Metric | Value |
|---|---|
| Total `public` tables | **553** |
| Tables with RLS enabled | **553 (100%)** |
| Tables **without** RLS | **0** |
| `meta_*` tables | 51 |
| `zi_*` tables | 12 |
| `meta_*_claim_due` / queue RPCs (SECURITY DEFINER) | 9 |

## 3. Per-family verification (newly deployed)

Confirmed for the 66 target-family tables (`meta_*` + the 15 feature tables): **all 66 have RLS enabled.** Policy presence:

- Feature tables (`israel_neighborhoods`, `creative_*`, `agency_*`, `broker_*`, `mai_*`, `copilot_*`, `zi_*`) — RLS on, org-scoped SELECT + role-gated writes present. Verified policy counts: agency_* = 4 policies each, creative_* = 4 each, broker_recommendation_events = 2 (append-only), copilot_* = 1–2, israel_neighborhoods = 1 (select-true reference), mai/broker_growth = 1 (org read).
- `zi_learning_progress` — per-user policies (`user_id = auth.uid()`); `zi_tutorials/walkthroughs/glossary/faq` — org read + manager write.
- Meta tables — org SELECT; writes service-role-only.
- **Intentional exception (verified):** `meta_token_health` and `meta_sync_cursor` are RLS-enabled with **no** authenticated policy — service-role-only by design (they hold sync cursors / token-health history). These are the only two `meta_*` tables with zero policies, exactly as their migration specifies.

## 4. SECURITY DEFINER queue RPCs

All 9 `meta_*` claim/budget RPCs exist and pin `set search_path = public`. Four were runtime-exercised against empty queues:

| RPC | Result |
|---|---|
| `meta_publish_claim_due(now(),0,1,'smoke',30)` | executed, 0 rows |
| `meta_comment_claim_due(...)` | executed, 0 rows |
| `meta_intelligence_claim_due(...)` | executed, 0 rows |
| `meta_messaging_claim_due(...)` | executed, 0 rows |

## 5. Security advisor (post-deploy)

- **ERROR-level: 0.**
- INFO `rls_enabled_no_policy`: 13 total, of which **2 are my new tables** — the intended service-role-only `meta_token_health` + `meta_sync_cursor`. The other 11 are pre-existing tables.
- WARN `security_definer_function_executable` (anon + authenticated): 17 + 17, of which **9 + 9 are the new `meta_*` queue RPCs**. These functions are meant to be called only by the internal service-role dispatcher. **The repo migrations do not `revoke execute` from anon/authenticated**, so the live grants match the repo exactly — adding a REVOKE now would create new DB→repo drift. Tracked as a backlog item for a future repo migration (see Phase 5).
- WARN `function_search_path_mutable`: 6 — **none** are the new RPCs (all 9 correctly pin search_path).
- WARN `auth_leaked_password_protection`: 1 — pre-existing project setting, off. Backlog.

## 6. Performance advisor (post-deploy)

- **ERROR-level: 0.** 1,944 lints total, all INFO/WARN.
- `unindexed_foreign_keys` (INFO): 526 total, 78 on newly-deployed tables. Optimization backlog — add covering indexes before heavy production load.
- `unused_index` (INFO): 952 total, 105 on newly-deployed tables — expected on freshly-created empty tables; will resolve as they take traffic or be pruned.
- `multiple_permissive_policies` (388) and `auth_rls_initplan` (72) — largely pre-existing; new tables mostly carry a single SELECT policy.

## 7. Alignment verdict for this phase

Staging now contains every table the repository's migrations define, with RLS enforced on 100% of public tables, the new queue RPCs executing at runtime, and zero advisor errors. The remaining items (SECURITY DEFINER execute grants, unindexed FKs, leaked-password protection) are non-blocking backlog, consistent with the repo definitions. Detailed repo↔DB reconciliation is in `FINAL_SCHEMA_RECONCILIATION.md`.
