# ZONO CRM 360 — Undeployed Feature Family Review (Phase 2)

Every feature family whose migrations were undeployed at the start of this program, reviewed for: is it implemented, is the code referenced, is it dead, does it carry production value, what does it depend on, and the deploy decision. All families below were **deployed to staging this session**; none were postponed or archived.

## 1. National Geo Reference — `israel_neighborhoods`

- **Implemented?** Yes. One nationwide, org-independent neighborhood reference table (mirrors `israel_localities` for cities).
- **Referenced?** Yes — 8 code files use it (geo layer + transaction scan).
- **Dependencies:** `set_updated_at()` (present). No org FK by design — it is shared reference data; writes are service-role only, reads open to any authenticated user.
- **Production value:** High — the geo/transaction-scan layer works for every Israeli city rather than one.
- **Decision:** DEPLOY NOW. Done.

## 2. Creative QA & Regeneration — `creative_generations`, `creative_generation_attempts`, `creative_qa_reports`

- **Implemented?** Yes. Persists every AI ad generation, each attempt, and each QA report so the user only ever sees an approved image while all attempts are retained for debugging.
- **Referenced?** Yes — `creative-qa-engine.ts` and one more file insert into these tables (2 files).
- **Impact of prior absence:** Creative Studio still generated images (Supabase returns `{data,error}` without throwing on a missing table), but **QA history was not persisted**. Now persisted.
- **Decision:** DEPLOY NOW. Done.

## 3. AI Agency Identity Resolver — `agency_aliases`, `agency_resolution_candidates`, `agency_ai_feedback`

- **Implemented?** Yes. Resolves messy raw agency text into agency entities: an alias index for de-duplication, a candidate table with confidence + evidence, and a human-in-the-loop feedback/audit log.
- **Referenced?** Yes — resolver 4–5 files, feedback 3 files.
- **Dependencies:** FK → `agencies` (present). `agency_ai_feedback` FK → `agency_resolution_candidates` (deployed immediately before it, in canonical order).
- **Decision:** DEPLOY NOW. Done.

## 4. ZI Interactive Learning — `zi_learning_progress`, `zi_tutorials`, `zi_walkthroughs`, `zi_glossary`, `zi_faq`

- **Implemented?** Yes. Per-user learning progress + optional org-authored learning content on top of built-in content shipped in code. ZI stays support-only (teach/explain/guide).
- **Referenced?** **Yes** — `src/lib/zi-expert/learning-repository.ts` does `select`/`upsert` on `zi_learning_progress` and **throws on error**; a full `src/lib/zi-expert/` module + `ZILearnPanel.tsx` component exist. (Corrects an earlier "not wired" note.)
- **Impact of prior absence:** the ZI Learn panel's `upsertProgress` would have thrown at runtime — a real, non-graceful dependency.
- **Dependencies:** FK → `auth.users`, `organizations`; helpers `current_org_id()`, `has_min_role()` (all present). Progress rows are per-user (`user_id = auth.uid()`); content tables are org-read, manager-write.
- **Decision:** DEPLOY NOW. Done.

## 5. Broker Intelligence — `broker_growth_strategy`, `mai_model_calibration`, `broker_recommendation_events`

- **Implemented?** Yes. Autonomous Growth Strategy (evidence-backed execution plan; Zone Dominance projection clearly marked SIMULATION), Self-Learning & Model Calibration (measures model accuracy; recommends but never auto-applies calibration), and the recommendation lifecycle event log (append-only Accept/Dismiss/Snooze/… decisions).
- **Referenced?** Yes — growth 4 files, calibration 2 files, recommendation events 1 file.
- **Dependencies:** FK → `broker_profiles` (present), `organizations`, `users`. `broker_recommendation_events` is append-only (INSERT/SELECT policies only).
- **Decision:** DEPLOY NOW. Done.

## 6. AI Communication Copilot — `copilot_conversation_insight`, `copilot_reply_suggestion`, `copilot_timeline_milestone`, `copilot_feedback`, `copilot_enrichment`

- **Implemented?** Yes. Reads canonical conversations; writes only `copilot_*` tables. Every artifact carries an explainability envelope; reply suggestions are proposals that always require approval and are never auto-sent; feedback is evaluation-only; the enrichment cache is invalidated by a deterministic freshness hash.
- **Referenced?** Yes — 6 + 2 files.
- **Dependencies:** FK → `organizations`, `users`; `auth.uid()` gate on feedback insert.
- **Decision:** DEPLOY NOW. Done.

## 7. Meta Workspace (Batch 6.8) — 5 phases, 27 tables + 3 RPCs

- **Implemented?** Yes. Connections/assets/permissions/token-health (Phase 1); content studio, drafts, media, approvals (Phase 2); immediate publishing (3A); scheduling, durable queue, automatic retry, dead-letter, rate budget with SKIP-LOCKED lease claim (3B); reconciliation, webhooks, provider verification, drift detection (3C).
- **Referenced?** Yes — connection 5, draft 3, publish operation 3, publish job 2, webhook 3 files.
- **Security posture:** encrypted token columns never projected to clients; `meta_token_health` + `meta_sync_cursor` are RLS-enabled with **no** authenticated policy (service-role only, by design); all publishing/queue writes are service-role after server-side role checks.
- **Decision:** DEPLOY NOW (strict phase order 1 → 2 → 3A → 3B → 3C, enforced by cross-phase FKs and ALTERs). Done.

## 8. Meta Social Intelligence (Batch 6.9) — 6 phases, 24 tables + 6 RPCs

- **Implemented?** Yes. Comment ingestion & moderation (P1); insights & analytics as append-only time series (P2); unified inbox projection over comment threads (P3); engagement intelligence — classification signals + next-best-action suggestions that route into existing approval-gated workflows and never execute a provider write (P4); social listening for Meta-supported mentions from connected assets only, no open-web scraping (P5); Messenger + Instagram DM with AES-256-GCM ciphertext bodies and approval-gated, window-checked outbound (P6).
- **Referenced?** Yes — comment 6, inbox 4, engagement_signal 4, listening 3, dm 3, insight 2 files.
- **Decision:** DEPLOY NOW. Done.

## Deploy/postpone/archive summary

| Family | Tables | Decision |
|---|---|---|
| National geo | 1 | DEPLOY ✅ |
| Creative QA | 3 | DEPLOY ✅ |
| Agency resolver | 3 | DEPLOY ✅ |
| ZI learning | 5 | DEPLOY ✅ |
| Broker intelligence | 3 | DEPLOY ✅ |
| Communication Copilot | 5 | DEPLOY ✅ |
| Meta Workspace 6.8 | 27 (+3 RPC) | DEPLOY ✅ |
| Meta Social Intelligence 6.9 | 24 (+6 RPC) | DEPLOY ✅ |

**Postponed: none. Archived: none.** Every family was implemented, code-wired, clean, and dependency-satisfied.
