# ZONO CRM 360 — Foreign-Key Index Hardening (Phase 3)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. Production never touched.
**Date:** 2026-08-05
**Migration:** `supabase/migrations/20270203120000_meta_fk_index_hardening.sql` (applied)

## Baseline

The performance advisor reported ~78 unindexed foreign keys on newly-deployed tables. A precise catalog query (single-column FKs whose column is not the leading column of any index, restricted to the deployed families) counted **82** unindexed FKs.

## Classification (not blind indexing)

| Priority | Category | Action |
|---|---|---|
| HIGH | ON DELETE CASCADE lifecycle chains (connection→assets, draft→publish, provider_object/publish_operation/publish_target children, comment/media/inbox children) | **indexed now** |
| HIGH | child `org_id` FK on `creative_generation_attempts` / `creative_qa_reports` (RLS + org filter) | **indexed now** |
| MED | inbox `assignee_user_id` ("my assigned conversations" filter) | **indexed now** |
| MED | cascade links: `broker_growth_strategy.broker_id`, `creative_qa_reports.attempt_id`, `copilot_feedback.user_id`, `zi_learning_progress.user_id` | **indexed now** |
| LOW | ~30 audit columns (`created_by`/`requested_by`/`decided_by`/`approved_by`/`uploaded_by`/… ON DELETE SET NULL → users) | **deferred** |
| LOW | small set-null links (agencies, webhook `matched_*`, `dead_letter_id`, `source_event_id`, `source_reconciliation_attempt_id`) | **deferred** |

Rationale for deferral: the audit/`*_by` columns are low-cardinality references written once and rarely used as a query predicate; `ON DELETE SET NULL` on user deletion is infrequent; indexing all of them would add ~30 low-value indexes (write-amplification for negligible read benefit). They are recorded here as backlog rather than created.

## Applied — 37 covering indexes

Connection children (6): `meta_business`, `meta_instagram_account`, `meta_page`, `meta_permission_snapshot`, `meta_sync_cursor`, `meta_token_health` on `connection_id`.
Content/publish lifecycle (7): `meta_approval_comment(draft_id, approval_request_id)`, `meta_approval_request(draft_id)`, `meta_content_draft_target(draft_id)`, `meta_publish_operation(draft_id)`, `meta_publish_target(draft_target_id)`, `meta_media_variant(media_asset_id)`.
Comments/engagement/inbox (6): `meta_comment_ingestion_job(target_comment_id, engagement_action_id)`, `meta_engagement_action(target_comment_id)`, `meta_inbox_assignment(conversation_id)`, `meta_inbox_conversation_label(label_id)`, `meta_inbox_conversation(assignee_user_id)`.
provider_object children (4), publish_operation children (5), publish_target children (3).
Feature families (6): `broker_growth_strategy(broker_id)`, `creative_qa_reports(attempt_id, org_id)`, `creative_generation_attempts(org_id)`, `copilot_feedback(user_id)`, `zi_learning_progress(user_id)`.

## Evidence

| Metric | Before | After |
|---|---|---|
| Unindexed single-column FKs (deployed families) | **82** | **46** |
| New `idx_*` FK indexes physically present | 0 | **37** |

The 46 remaining are the intentionally-deferred low-value audit/set-null columns listed above.

**Query-plan note (important caveat):** an `EXPLAIN` on the staging tables still shows `Seq Scan`, e.g.:

```
explain (costs off) select 1 from meta_publish_target where publish_operation_id = <uuid>;
→ Seq Scan on meta_publish_target
```

This is expected and correct: the staging tables are **empty**, and Postgres always prefers a sequential scan over an index scan on a zero/low-row table (the seq scan is genuinely cheaper). The indexes are present and will be chosen by the planner once the tables hold enough rows. A representative index-vs-seqscan plan comparison is therefore only meaningful against a seeded/production-size dataset — deferred to the seeded-E2E phase.

## Production note

On production-size tables these indexes should be created with `CREATE INDEX CONCURRENTLY` (outside a transaction) to avoid an `ACCESS EXCLUSIVE` lock during the build. On empty staging the plain `create index if not exists` is instant and lock-free, so it is used here; the production runbook should switch to `CONCURRENTLY`.

## Advisor delta

Security advisor after this phase: still **0 ERROR**. The performance advisor's `unindexed_foreign_keys` count for deployed families drops by 36; the residual entries are the documented deferred set. `unused_index` warnings increase (the 37 new indexes are unused on empty tables) — expected and not actioned, per the directive not to chase `unused_index` on empty staging tables.
