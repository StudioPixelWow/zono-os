# ZONO CRM 360 — Deployment Wave Plan (Phase 3)

The 21 READY migrations were grouped into three dependency-ordered waves. Waves reflect the actual apply order used against `zono-dev`. Everything is additive + idempotent, so each wave is independently re-runnable and each migration rolls back cleanly on failure (single-transaction `apply_migration`).

## Wave 1 — Foundation & standalone features (10 migrations, 18 tables)

Independent of one another except the single ordering constraint `agency_resolver → agency_ai_feedback`. Each references only pre-existing parent tables.

| Order | Migration | Tables | Depends on |
|---|---|---|---|
| 1 | israel_neighborhoods | 1 | set_updated_at |
| 2 | creative_qa_engine | 3 | organizations, properties, users |
| 3 | agency_resolver | 2 | agencies |
| 4 | agency_ai_feedback | 1 | **agency_resolver** (candidates table) |
| 5 | zi_learning | 5 | auth.users, organizations |
| 6 | broker_growth_strategy | 1 | broker_profiles |
| 7 | mai_model_calibration | 1 | organizations |
| 8 | broker_recommendation_lifecycle | 1 | organizations, users |
| 9 | comm_copilot | 4 | organizations, users |
| 10 | comm_copilot_enrichment | 1 | organizations |

- **Risk:** Low. Small tables, standard org-scoped RLS, append-only where relevant.
- **Rollback:** Drop the newly-created tables (all `if not exists`, so re-apply is safe). No data migration, so rollback is loss-free on empty tables.

## Wave 2 — Meta Workspace 6.8 (5 migrations, 27 tables + 3 RPCs)

**Strict sequential order required** — cross-phase foreign keys and additive `ALTER … ADD COLUMN` / widened check constraints:

```
phase1 (assets)  →  phase2 (content)  →  3a (publish)  →  3b (queue/retry)  →  3c (reconcile/webhooks)
```

| Order | Migration | New tables | Cross-phase dependency |
|---|---|---|---|
| 11 | meta_workspace_phase1 | 7 | — |
| 12 | meta_workspace_phase2 | 7 | — (org/users only) |
| 13 | meta_workspace_phase3a | 4 | FK → phase2 `meta_content_draft`, `_target` |
| 14 | meta_workspace_phase3b | 4 (+2 RPC) | ALTER of 3a tables; FK → 3a |
| 15 | meta_workspace_phase3c | 5 (+1 RPC) | ALTER of 3a/3b; FK → 3a `meta_provider_object`, 3b `meta_publish_dead_letter` |

- **Risk:** Medium (ordering-sensitive). Mitigated by canonical version order and single-transaction apply — a wrong order fails cleanly with no partial state.
- **Rollback:** Reverse phase order (3c → phase1). Secrets stay service-role-only throughout; nothing user-facing depends on the queue tables being empty vs present.

## Wave 3 — Meta Social Intelligence 6.9 (6 migrations, 24 tables + 6 RPCs)

Phases 1–3 each add columns to `meta_provider_object` (applied **sequentially** to avoid concurrent `ACCESS EXCLUSIVE` locks on that one table). Phases 4–6 are fully standalone (no cross-phase FK constraints) and were applied together.

| Order | Migration | New tables | Note |
|---|---|---|---|
| 16 | 6_9_phase1_comments | 4 (+1 RPC) | ALTER meta_provider_object; FK → 3a, 3c |
| 17 | 6_9_phase2_insights | 4 (+1 RPC) | ALTER meta_provider_object; append-only snapshots |
| 18 | 6_9_phase3_inbox | 6 (+1 RPC) | projection over comment threads |
| 19 | 6_9_phase4_intelligence | 3 (+1 RPC) | standalone; suggestions never auto-execute |
| 20 | 6_9_phase5_listening | 3 (+1 RPC) | standalone; read-only at provider |
| 21 | 6_9_phase6_messaging | 4 (+1 RPC) | standalone; ciphertext bodies; approval-gated send |

- **Risk:** Low–Medium. Phases 1–3 sequential for lock-safety; 4–6 parallel-safe.
- **Rollback:** Drop the wave's tables + the 6 `meta_*_claim_due` RPCs; the `ALTER … ADD COLUMN IF NOT EXISTS` additions on `meta_provider_object` are harmless to leave.

## Migration count summary

| Wave | Migrations | New tables | New RPCs |
|---|---|---|---|
| 1 — Foundation & features | 10 | 18 | 0 |
| 2 — Meta Workspace 6.8 | 5 | 27 | 3 |
| 3 — Meta Social 6.9 | 6 | 24 | 6 |
| **Total** | **21** | **69** | **9** |

`schema_migrations`: **14 → 35**. (New-table count differs slightly from raw `create table` totals because several later phases add columns to earlier tables rather than new tables; 51 `meta_*` + 12 `zi_*` + the feature tables are all live.)

## Global rollback & safety posture

- All 21 migrations are additive + idempotent; **no** destructive DDL was executed. Re-running the full set is a no-op.
- Every apply was a single MCP transaction against **staging only**. Production was never a target and was never touched.
- No blind applies: each migration was read, risk-scanned, and dependency-checked against the live schema before apply.
