# ZONO CRM 360 — Feature-Family Smoke Results (Phase 7)

**Date:** 2026-08-05 · **Target:** staging `zono-dev` (`tlrefajhyrqnjtmimaos`)

Two layers of smoke evidence: **database-runtime** (executed this session) and **application-level** (blocked on the deployed app, Phase 5).

## Layer A — Database-runtime smoke (✅ executed)

| Family | DB smoke evidence | Result |
|---|---|---|
| Meta Workspace | 51 `meta_*` tables live-queryable; 9 queue RPCs execute; publish/reconcile/comment/inbox/insight/intelligence/listening/messaging queues respond | ✅ |
| Meta Social Intelligence | comment/insight/inbox/engagement_signal/listening/dm tables queryable (0 rows, no error) | ✅ |
| Communication Copilot | `copilot_conversation_insight/reply_suggestion/timeline_milestone/feedback/enrichment` queryable; feedback insert policy requires `user_id=auth.uid()` | ✅ |
| ZI Learning | `zi_learning_progress` queryable; per-user RLS (`user_id=auth.uid()`) enforced; content tables org-read/manager-write | ✅ |
| Broker Intelligence | `broker_growth_strategy`, `mai_model_calibration`, `broker_recommendation_events` queryable; simulation columns present | ✅ |
| Agency Resolver | `agency_aliases`, `agency_resolution_candidates`, `agency_ai_feedback` queryable; org-scoped RLS | ✅ |
| Creative QA | `creative_generations/_attempts/_qa_reports` queryable; org-scoped RLS | ✅ |
| Israel Neighborhoods | `israel_neighborhoods` queryable; select-to-authenticated reference; writes service-role only | ✅ |

Runtime facts captured: 66 target-family tables RLS-enabled; RPCs `meta_publish/comment/intelligence/messaging_claim_due` returned 0 rows cleanly; queue RPCs now denied to anon/authenticated (Phase 2).

## Layer B — Application-level smoke (⛔ blocked on Phase 5)

Not executable without the deployed app. To run once deployed:

- **Meta Workspace:** connection screen, assets/permissions, draft create, approval request, scheduling, queue op, failed-publish state, reconciliation state — provider-disabled/mock mode; no real customer page targeted.
- **Meta Social Intelligence:** comments, insights, inbox projection, engagement signal, next-best-action approval gate, listening source, messaging draft — no unauthorized outbound send.
- **Copilot:** reads canonical conversation → suggestion → approval-gated → feedback persists → no auto-send.
- **ZI Learning:** progress read/upsert; cross-user denied; panel resilient when content empty.
- **Broker Intelligence:** growth/calibration load; recommendation event persists; simulations labeled.
- **Agency Resolver:** alias lookup, candidate create, feedback, org isolation.
- **Creative QA:** generation → attempts → QA report → failure history retained → approved surfaced.
- **Israel Neighborhoods:** search/query; no tenant mutation by ordinary users.

## Status

Database-runtime smoke: **8/8 families ✅**. Application-level smoke: **0/8 — blocked**. App-level smoke is an open Design-Partner gate.
