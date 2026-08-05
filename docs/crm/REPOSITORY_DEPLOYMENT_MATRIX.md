# ZONO CRM 360 — Repository Deployment Matrix (Phase 1)

**Program:** Repository ⇄ Database Final Reconciliation
**Target:** `zono-dev` (Supabase project `tlrefajhyrqnjtmimaos`) — **staging only. Production never touched.**
**Date:** 2026-08-05
**Channel:** Supabase MCP `apply_migration` (the only channel that reaches the live DB; HTTP proxy blocks direct Supabase).

## Method

Every undeployed migration that the repository defines but the staging DB did not yet contain was read in full, scanned for risk signals (enum/type creation, extensions, unguarded triggers, non-idempotent DDL, foreign-key parents), cross-checked against the live schema for dependency satisfaction, and classified. Only migrations classified **READY TO DEPLOY** were applied. Nothing was applied blind.

Baseline before this session: `supabase_migrations.schema_migrations` tracked **14** migrations (the 10 historical + the 4 Epic 3 migrations applied in the prior program). The migration pipeline had stopped tracking new migrations ~2026-08-04 while the repo advanced, so a set of wired feature migrations existed in the repo with their tables absent from staging.

## Classification legend

- **READY TO DEPLOY** — additive, idempotent, org-scoped RLS, all FK parents + helper functions present, code-wired. Applied.
- **NEEDS REVIEW / OBSOLETE / SUPERSEDED / EXPERIMENTAL** — not applied.

## The matrix — 21 migrations, all classified READY, all deployed

| # | Migration (version) | Tables created | Code files | Risk scan | Class | Applied |
|---|---|---|---|---|---|---|
| 1 | `20260620140000_israel_neighborhoods` | 1 (israel_neighborhoods) | 8 | clean; guarded trigger; RLS select-true | READY | ✅ |
| 2 | `20260718120000_creative_qa_engine` | 3 (creative_generations, _attempts, _qa_reports) | 2 | clean; 1 trigger (guarded on apply); RLS loop | READY | ✅ |
| 3 | `20260756120000_agency_resolver` | 2 (agency_aliases, agency_resolution_candidates) | 5 | clean; FK→agencies (present); guarded RLS | READY | ✅ |
| 4 | `20260768120000_agency_ai_feedback` | 1 (agency_ai_feedback) | 3 | clean; widens candidate status check (idempotent) | READY | ✅ |
| 5 | `20260757120000_zi_learning` | 5 (zi_learning_progress, zi_tutorials, zi_walkthroughs, zi_glossary, zi_faq) | 2 | clean; FK→auth.users; guarded triggers + RLS | READY | ✅ |
| 6 | `20260801120000_broker_growth_strategy` | 1 | 4 | clean; FK→broker_profiles (present) | READY | ✅ |
| 7 | `20260802120000_mai_model_calibration` | 1 | 2 | clean; org-scoped read | READY | ✅ |
| 8 | `20260920120000_broker_recommendation_lifecycle` | 1 (broker_recommendation_events) | 1 | clean; append-only (INSERT/SELECT) | READY | ✅ |
| 9 | `20261115120000_comm_copilot` | 4 (copilot_*) | 6 | clean; FK→users; auth.uid() gate on feedback | READY | ✅ |
| 10 | `20261125120000_comm_copilot_enrichment` | 1 (copilot_enrichment) | 2 | clean; org-scoped read | READY | ✅ |
| 11 | `20261201120000_meta_workspace_phase1` | 7 (connection/business/page/instagram/permission/token_health/sync_cursor) | 5 | clean; encrypted token cols never projected; 2 service-role-only tables | READY | ✅ |
| 12 | `20261205120000_meta_workspace_phase2` | 7 (media_asset/variant, content_draft/target/version, approval_request/comment) | 3 | clean; org + agent-role RLS | READY | ✅ |
| 13 | `20261210120000_meta_workspace_phase3a` | 4 (publish operation/target/attempt, provider_object) | 3 | clean; FK→phase2 draft; service-role writes | READY | ✅ |
| 14 | `20261215120000_meta_workspace_phase3b` | 4 (job/job_attempt/dead_letter/rate_budget) + 2 SECURITY DEFINER RPCs | 2 | clean; additive ALTER of 3a; hardened search_path | READY | ✅ |
| 15 | `20261220120000_meta_workspace_phase3c` | 5 (webhook_event, reconciliation job/attempt, provider_object_state, discrepancy) + 1 RPC | 3 | clean; additive ALTER of 3a/3b | READY | ✅ |
| 16 | `20261225120000_meta_workspace_6_9_phase1_comments` | 4 (comment/thread/engagement_action/ingestion_job) + 1 RPC | 6 | clean; approval-gated actions | READY | ✅ |
| 17 | `20261230120000_meta_workspace_6_9_phase2_insights` | 4 (object/account insight, refresh state/job) + 1 RPC | 2 | clean; append-only snapshots | READY | ✅ |
| 18 | `20261231120000_meta_workspace_6_9_phase3_inbox` | 6 (conversation/label/conv_label/assignment/sync_state/sync_job) + 1 RPC | 4 | clean; local-only inbox state | READY | ✅ |
| 19 | `20270101120000_meta_workspace_6_9_phase4_intelligence` | 3 (engagement_signal/next_best_action/intelligence_job) + 1 RPC | 4 | clean; suggestions never auto-execute | READY | ✅ |
| 20 | `20270102120000_meta_workspace_6_9_phase5_listening` | 3 (listening_source/mention/listening_job) + 1 RPC | 3 | clean; read-only at provider | READY | ✅ |
| 21 | `20270103120000_meta_workspace_6_9_phase6_messaging` | 4 (dm_conversation/message/send/messaging_job) + 1 RPC | 3 | clean; bodies ciphertext; outbound approval-gated | READY | ✅ |

**Result of Phase 4 apply:** `schema_migrations` **14 → 35** (exactly +21). Every `apply_migration` returned `{"success":true}`.

## Notes on the risk scan (all 21)

- **Zero** `create type` / enum statements. **Zero** `create extension`. All status/kind columns are `text` + `check` constraints (widening a check set is done idempotently via drop-constraint-if-exists + re-add).
- **All** `create table` statements are `if not exists`; all functions are `create or replace`; all policies are guarded by `drop policy if exists` or `pg_policies` existence checks. Re-running any migration is a no-op.
- **9 SECURITY DEFINER RPCs** (the `meta_*_claim_due` queue-claim helpers + `meta_publish_consume_budget`) all pin `set search_path = public` — so they are absent from the advisor's `function_search_path_mutable` list.
- Dependency pre-check confirmed live: `agencies`, `broker_profiles`, `properties`, `organizations`, `users`, `auth.users`, and helper functions `current_org_id()`, `has_min_role()`, `set_updated_at()` all present before apply.

## Correction logged

`zi_learning` was tentatively marked "not wired (0 refs)" in the prior program's notes. A fresh grep proved this wrong: `src/lib/zi-expert/learning-repository.ts` performs a real `select` + `upsert` on `zi_learning_progress` (and `upsertProgress` **throws** on error), and there is a full `src/lib/zi-expert/` module + `ZILearnPanel` component. It was reclassified **READY** and deployed. No migration in the target set is OBSOLETE, SUPERSEDED, or EXPERIMENTAL.
