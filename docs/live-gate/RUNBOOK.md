# ZONO OS 2.0 — Live Activation Gate · Operator Runbook (Phase A)

## ⛔ Why this is a runbook, not a completed gate

**Phase A cannot be executed from the build/agent environment.** It has no access to your live Supabase project: no service-role credentials, no `supabase` CLI, no linked project, no DB connection, and it cannot invoke your deployed `/api/cron/kernel-drain`. Every mandatory A-gate (apply migrations, RLS tests with real accounts, kernel drain, live smoke flows, real latency) requires an operator with production/staging credentials.

Per the sprint's own rule — *"No fabricated data … or be explicitly marked 'requires live verification'"* — I will not print invented pass results or millisecond numbers. Instead this directory contains the **real, runnable gate** you execute; the SQL and commands produce genuine pass/fail against your database.

**Current decision (until you run this):** `LIVE GATE NOT EXECUTED — REQUIRES OPERATOR RUN.` Do **not** start Stage 5 until the operator run yields `LIVE GATE PASSED`.

Files:
- `verify_schema.sql` — A3 post-migration object existence (every row must be `ok=true`).
- `rls_tests.sql` — A5 authorization tests (ai_memory owner/manager/cross-org/anon + cross-table isolation).
- `idempotency_and_perf.sql` — A8 duplicate detection + A10 EXPLAIN ANALYZE baseline.

---

## A1 — Pre-flight safety (run first, record output)

```bash
# 1. Confirm the target project + environment (NEVER run against an unidentified project)
supabase projects list
supabase link --project-ref <YOUR_PROJECT_REF>     # confirm it matches the intended env
# 2. Current git commit
git rev-parse HEAD && git status --porcelain
# 3. Migration history vs repo (what's already applied)
supabase migration list                            # remote vs local applied state
# 4. Backup BEFORE any DDL
supabase db dump -f backup_$(date +%Y%m%d_%H%M).sql # or take a dashboard PITR snapshot
# 5. Confirm service-role key is server-only (never in client bundle)
grep -rn "SERVICE_ROLE" .env.local && echo "must be server-only; never NEXT_PUBLIC_*"
# 6. Disk space for typegen/tests
df -h .
```
Record: project ref, env, HEAD commit, applied-migration count, backup filename. **Do not proceed if any migration shows partially-applied or the project ref is not the intended one.**

## A2 — Migration inventory (repo-verified; confirm against `supabase migration list`)

Pending migrations for Stages 1–4.6 (all present in `supabase/migrations/`, additive + idempotent):

| Area | Migration |
|---|---|
| WhatsApp cloud hardening | 20260913120000 |
| Facebook per-user connection | 20260914120000 |
| WhatsApp per-user session | 20260915120000 |
| Meeting lifecycle | 20260916120000 |
| Canonical Deal identity | 20260917120000 |
| Seller linkage bridge | 20260918120000 |
| Event Kernel (domain_events) | 20260919120000 |
| Broker recommendation lifecycle | 20260920120000 |
| Timeline guarantee | 20260921120000 |
| Subscriber deliveries | 20260922120000 |
| Search projection | 20260923120000 |
| Graph edge lifecycle | 20260924120000 |
| Canonical AI Memory | 20260925120000 |
| **AI Memory RLS repair (STAB-1)** | **20260926120000** |
| (earlier support: compute cache 20260910, ask conversations 20260911, perf indexes 20260912, qa1 rls coverage 20260907) | applied |

**`docs/supabase-audit-fixes-ALL.sql` — classification (each block is guarded + idempotent, safe to re-run):**
- **A (P0 security)** storage org-path isolation + per-user FB/WhatsApp RLS — **STILL REQUIRED if the 20260914/20260915 per-user migrations aren't applied**; the block re-adds `user_id` columns `if not exists` and corrects the policies. Safe to run.
- **B** deal_profiles + children ownership RLS — **required** (guarded on `assigned_agent_id` existing).
- **C** property_score_events append-only — low, safe.
- **D** zono_* FK integrity (NOT VALID) — high, safe (existing rows not scanned; VALIDATE later per table).
- **E** deals.value/commission → bigint — runs only if still `integer`; **superseded/no-op** if already bigint.
- **F** approval_decisions, **G** user_ui_preferences, **H** journey_notes — feature tables, `create table if not exists`. **`journey_notes` (H) is a Stage-5 B10 prerequisite — apply it.**
- **I** index coverage pack — perf, guarded.
- **None are unsafe to re-run.** Apply the whole file after the numbered migrations; the guards make it a no-op where already applied.

## A3 — Apply migrations, then verify

```bash
supabase db push                 # applies pending numbered migrations, stops on first error
# then apply the guarded audit-fix consolidated SQL:
psql "$DATABASE_URL" -f docs/supabase-audit-fixes-ALL.sql
# VERIFY every object exists (must be all ok=true):
psql "$DATABASE_URL" -f docs/live-gate/verify_schema.sql
```
**Stop immediately on any error. Do not skip failed statements. Do not mark applied unless it truly succeeded.** Any `ok=false` row in `verify_schema.sql` = GATE FAILURE for that object.

## A4 — Regenerate types + remove stale casts

```bash
supabase gen types typescript --linked > src/lib/supabase/types.ts
# Now remove ONLY the casts that existed because types were stale:
grep -rn '"ai_memory" as never\|"visibility" as never\|as never' src/lib/memory-canonical src/lib/search-projection src/lib/kernel
# Remove those `as never` casts where the column now exists in generated types; keep legitimate validation/compat guards.
npx tsc --noEmit                 # full TypeScript
npx eslint src                   # ESLint
```
Commit regenerated types + cast cleanup **as a separate commit** (`chore(types): regen from live schema + drop stale casts`).

## A5 — Database policy verification

Fill the real user/org UUIDs at the top of `docs/live-gate/rls_tests.sql`, then:
```bash
psql "$DATABASE_URL" -f docs/live-gate/rls_tests.sql
```
**Mandatory ai_memory result — all `ok_should_be_true` must be `true`:** owner reads own (T1) · same-org broker blocked (T2) · manager blocked from private (T3) · cross-org blocked (T4) · anon blocked (T5) · qa1_read carries the private gate (T6). Also verify the app path (not just SQL): sign in as Broker B in the app and confirm A's private memory is absent from B's memory views. Any failure = **security GATE FAILURE — do not proceed.**

## A6 — Kernel drain activation

```bash
# CRON_SECRET must be set in the deployed environment.
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/kernel-drain
# Expect 200 {ok:true, scanned, done, failed, ...}. 401 = secret misconfigured.
```
Then inspect: pending→processing→done transitions in `domain_events`; `retry_count` increments on failure; rows stuck in `processing` recover on the next drain; every subscriber recorded in `domain_event_deliveries` (timeline/notification/automation/recommendation/graph/memory/search). No subscriber may be silently absent.

## A7 — Live end-to-end smoke flows

Run flows 1–11 with clearly-labelled QA records (e.g. names prefixed `ZZ_QA_`), draining the kernel between each, then clean up. Verify each flow's DB writes with the queries below (substitute the entity id):
```sql
-- after any flow, confirm the event + projections landed exactly once:
select event_type, processing_status, count(*) from public.domain_events
  where entity_id = '<id>' group by 1,2;                       -- one row per real mutation
select subscriber, status from public.domain_event_deliveries d
  join public.domain_events e on e.id=d.event_id where e.entity_id='<id>';
select * from public.activity_events where entity_id='<id>';   -- timeline
select * from public.search_documents where entity_id='<id>';  -- search
select * from public.entity_relationships where source_entity_id='<id>' or target_entity_id='<id>'; -- graph
select * from public.ai_memory where entity_id='<id>' and active; -- memory
```
Flow-specific expectations are in the stabilization report (§12). **Flow 10 (FB/WhatsApp):** only pass if a genuine provider connection is configured; otherwise mark **blocked by external configuration**, not passed. **Flow 9 (documents):** do not claim external e-signature unless a real provider is wired. **Flow 7 (Deal Won):** re-drain and confirm revenue/commission is not double-counted.

## A8 — Idempotency replay

Re-invoke the drain (A6) after flows, then:
```bash
psql "$DATABASE_URL" -f docs/live-gate/idempotency_and_perf.sql   # A8 section: every `dups` must be 0
```
Any `dups > 0` = GATE FAILURE. The second query lists the constraints/indexes that enforce it (for the report).

## A9 — Failure tests (staging only — never corrupt prod)

In staging, force a throw in one secondary subscriber at a time (e.g. temporarily raise inside the graph/memory/search branch of `runDownstreamSubscribers`). Re-drain and verify: the event still lands in `activity_events`; the broken subscriber's `domain_event_deliveries.status = 'failed'` with an error; the other subscribers still `done`; retry increments; after `MAX_RETRIES` the row dead-letters (`processing_status='failed'`); no fabricated fallback rows appear; user surfaces degrade honestly (grounded context shows `failedLayers`). Revert the injected failure afterward.

## A10 — Live performance baseline

```bash
psql "$DATABASE_URL" -f docs/live-gate/idempotency_and_perf.sql   # A10 EXPLAIN ANALYZE + row counts
```
Run each hot query 10–20× with `\timing on` and record p50/p95/max + row counts. Measure emit latency (time an action → row in `domain_events`), drain batch latency (time the curl in A6), and Ask ZONO end-to-end (client timing). **Record only real numbers; mark any unmeasured path as "unmeasured."**

## A11 — Fill in the live activation report

Copy `RESULT_TEMPLATE.md` (below) and complete it with real output. The final line MUST be exactly one of:
- `LIVE GATE PASSED — PROCEED TO STAGE 5`
- `LIVE GATE FAILED — FIX [EXACT BLOCKER] FIRST`

Do not proceed to Stage 5 (Phase B) unless every **mandatory** gate passed: A3 schema verify all-true, A5 ai_memory + cross-org all-true, A6 drain 200 + all subscribers recorded, A7 flows 1–9 + 11 landed once each, A8 all dups=0. (A9/A10 are required to run but are not release-blocking unless they reveal a data-integrity or crash defect.)

---

### RESULT_TEMPLATE.md
```
1. Project/env verified: <ref> / <env>          6. RLS results: <T1..T6 + cross-table>
2. Migrations applied: <list>                    7. Kernel drain: <status + counts>
3. Migrations skipped + why: <list>              8. Subscriber deliveries: <7/7?>
4. Types regenerated: <yes/commit>               9. Flow results: <1..11 pass/blocked>
5. Casts removed: <list>                          10. Idempotency: <all dups=0?>
11. Failure recovery: <result>                   14. Remaining blockers: <list>
12. Performance baseline: <p50/p95 table>        15. Production readiness score: <n%>
13. Provider-dependent limits: <FB/WA/e-sign>    16. Commit hashes: <typegen, fixes>

DECISION: LIVE GATE PASSED — PROCEED TO STAGE 5   (or)  LIVE GATE FAILED — FIX <X> FIRST
```
