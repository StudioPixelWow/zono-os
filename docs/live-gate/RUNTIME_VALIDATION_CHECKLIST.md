# ZONO OS 2.0 — Runtime Validation Checklist

**Status: `PENDING LIVE DEPLOYMENT VALIDATION`**
These are **deployment verification items**, not development blockers. Every architectural, schema, security and idempotency gate has already passed live against `zono-dev` (`tlrefajhyrqnjtmimaos`). The items below require a reachable deployed application (the build/agent environment has no egress to the app or to the Supabase runtime), and are to be executed by an operator (or by the agent once deployment access exists) **without changing the architecture**.

## Already verified live (do NOT re-run)
- ✅ Migrations `20260921 / 20260922 / 20260925 / 20260926` applied via official `apply_migration`, recorded in migration history.
- ✅ Schema verification — all 15 previously-missing objects present.
- ✅ Security: `ai_memory` broker-private RLS behavioral test **4/4** (owner-reads-own; same-org non-owner blocked; cross-org blocked; anon blocked).
- ✅ Idempotency: outbox dedupe, delivery-ledger dedupe, and all DB-level unique/partial-unique constraints proven live; 0 QA rows persisted.
- ✅ Runtime emitter fix — commit `e26616d` (`emitBusinessEvent` now uses the service-role client in background/webhook contexts).
- ✅ 348 offline QA checks green (kernel 97 · search 43 · memory 32 · ai-context 56 · broker-intelligence 120).

## Pending deployment-verification items

| # | Item | How to verify | Expected |
|---|---|---|---|
| RV-1 | **Kernel drain executes** | `GET /api/cron/kernel-drain` with `Authorization: Bearer $CRON_SECRET` (or let the Vercel cron fire — `*/10 * * * *`) | HTTP 200 `{ok:true, scanned, done, …}` |
| RV-2 | **Real business mutation emits** | Perform a property price change in the deployed UI (`updatePropertyAction`) | A `property.price_changed` row in `domain_events` (status `pending`) |
| RV-3 | **Subscriber deliveries recorded** | After drain, query `domain_event_deliveries` for that `event_id` | One row per subscriber: timeline / notification / automation / recommendation / graph / memory / search — each `done` or `skipped` with a real classifier reason |
| RV-4 | **Projections landed** | Query `activity_events`, `search_documents`, `entity_relationships`, `ai_memory` for the entity | Timeline row + search upsert + (price fact) memory row; graph/notif only where applicable |
| RV-5 | **Replay is a no-op** | Re-run the drain | Zero new projection rows; deliveries unchanged (unique `(event_id, subscriber)`) |
| RV-6 | **Cache invalidation** | Check `zono_compute_cache` for `daily_os` / `executive_os` namespaces | Invalidated on relevant events |
| RV-7 | **Business smoke flows** | Property create/update/price · Buyer update · Seller linkage · Lead conversion · Meeting completed · Deal won/lost · Document created/signed | Each emits exactly one canonical event and projects correctly |
| RV-8 | **Ask ZONO persistence** | Send an Ask message, reload the page | Rows in `zono_ask_conversations` + `zono_ask_messages`; conversation restores |
| RV-9 | **Provider flows (if configured)** | Facebook / WhatsApp connect | `facebook.connected` / `whatsapp.connected` emitted. If no real provider configured → mark **blocked by external configuration**, not passed |
| RV-10 | **Runtime performance baseline** | Timed drain + `EXPLAIN ANALYZE` on hot reads | Record real p50/p95 for: event emit, drain batch, per-subscriber, timeline, search, graph, memory, recommendation queue, context assembly, Ask ZONO |
| RV-11 | **Type regeneration** | `supabase gen types typescript --linked` | Reconcile carefully — the project uses custom `TableShape` wrappers; remove only obsolete casts; tsc + eslint clean; commit separately |
| RV-12 | **Migration history reconciliation** | Audit the 16 already-applied migrations | Classify each (already represented / superseded / missing). **Do NOT blindly replay** — re-running `20260907` recreates the leaky `ai_memory_qa1_read` policy unless `20260926` runs strictly after it |

## Rules when executing this checklist
- No architecture changes. These are verification steps only.
- Use clearly-labelled QA records; clean up only QA entities afterwards (leave audit evidence, migration history, delivery metrics).
- Never insert `domain_events` manually — the flow must be: business action → `emitBusinessEvent` → `domain_events` → drain → subscribers.
- Do not fabricate any measured value. Anything unmeasured is marked **unmeasured**.
