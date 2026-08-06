# Database Reconciliation (Phase 2 / Phase 7)

Method: repo-declared tables (`create table public.*` across 214 migrations) diffed against the LIVE schema of `tlrefajhyrqnjtmimaos` (zono-dev), read-only via Supabase management API.

- Repo declares: 550 create-table names (historical, incl. renamed/dropped).
- Live public base tables: **476**, all with RLS enabled.

## Classification
### UNDEPLOYED — repo declares, ABSENT on live: **77 tables**
The live DB is 77 tables behind the code across MULTIPLE batches (a systemic pipeline failure, not an Epic-3 problem):
- **Epic 3 (6):** `offers, offer_events, commissions, collections, collection_events, note_edits` (+ notes-enrichment columns tags/mentioned_user_ids/is_archived/edited_at/edit_count).
- **Meta Workspace / Batch 6.9 social (~51):** the entire `meta_*` set — connection/page/instagram/business, content_draft(+target/version), publish_job(+attempt/target/operation/dead_letter/discrepancy/rate_budget), inbox_conversation(+label/assignment/sync), dm_conversation/message/send, comment/thread/ingestion, object_insight/account_insight/insight_refresh, listening_job/source, engagement_action/signal, mention, next_best_action, provider_object(+state), reconciliation/webhook/token_health/permission_snapshot, media_asset/variant, approval_request/comment, intelligence_job, messaging_job, sync_cursor.
- **AI Copilot (5):** `copilot_conversation_insight, copilot_enrichment, copilot_feedback, copilot_reply_suggestion, copilot_timeline_milestone`.
- **ZI knowledge (5):** `zi_faq, zi_glossary, zi_tutorials, zi_walkthroughs, zi_learning_progress`.
- **Creative persistence (3):** `creative_generations, creative_generation_attempts, creative_qa_reports`.
- **Misc (7):** `agency_ai_feedback, agency_aliases, agency_resolution_candidates, broker_growth_strategy, broker_recommendation_events, mai_model_calibration, israel_neighborhoods`.

→ Runtime impact: any deployed code path hitting these tables returns a Postgres "relation does not exist" error. Confirmed for Epic 3 (/offers, /commissions, /deals detail joins). The deployed Meta 6.9 features are likewise non-functional at the DB layer.

### ORPHAN — live, not matched to a repo create-table: **3** (all false positives)
`approval_decisions, journey_notes, user_ui_preferences` — these ARE created by repo migrations; the diff regex missed their exact DDL form (e.g. quoted/`if not exists` variants). No true out-of-band tables detected. **No unexplained live tables.**

### Storage
- `documents` bucket `public=true` on live — the private-storage migration (`20270402`) is UNDEPLOYED → sensitive documents exposed by URL. `property-media` public=true is intended.

### Functions / RLS / triggers (spot-verified)
- RLS: 476/476 live tables enabled; core org tables carry 5 policies + `org_id`. Helpers `current_org_id()/has_min_role()/is_org_member()` present. 252 `updated_at` triggers.
- These match the repo's conventions for the DEPLOYED subset; the 77 undeployed tables' RLS/policies/indexes/triggers are (by definition) absent live.

## Conclusion
No unexplained differences. Every difference is classified: 77 UNDEPLOYED (code ahead of DB) + 1 UNDEPLOYED storage change + 3 regex-artifact orphans. The single root cause: **the migration deployment pipeline stopped applying migrations after ~2026-08-04**, while the repo kept advancing (Meta 6.9, Copilot, ZI, Creative persistence, Epic 3).
