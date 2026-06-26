# PHASE 26 — ZONO Automation Orchestrator™ — Engineering Report

**Goal:** connect the disconnected systems found in QA‑01 into one automatic, reactive, locked pipeline. **Additive, typed, no UI redesign, no fake data, no breaking changes.** Verified: scoped `tsc` ✅, `eslint` 0 errors ✅. Commit `b351f40`.

---

## 1. What was built (files created)

```
src/lib/orchestrator/
├── types.ts          # ZonoOrchestratorTrigger enum, result/step types, thresholds, windows
├── logger.ts         # runStep() timing + error→step conversion; skippedStep()
├── locks.ts          # acquire/release per-org lock (service-role); 10-min expiry; force takes over EXPIRED only
├── repository.ts     # run ledger create/finalize + msSinceLastSuccessfulRun (staleness)
├── events.ts         # ★ BRIDGE external_listings→market_property_sources + new_property/price_drop events + alerts
├── revalidation.ts   # revalidateZonoRoutes() → 10 intelligence routes
├── triggers.ts       # runOrchestratorForSession() — resolves session org, runs orchestrator
├── service.ts        # ★ runZonoOrchestrator() — the 10-step pipeline, locking, status, persistence
├── actions.ts        # "use server" — runManualSyncOrchestratorAction()
└── index.ts          # public surface

supabase/migrations/20260780120000_zono_orchestrator.sql   # zono_orchestrator_runs + zono_orchestrator_locks + RLS
src/app/api/cron/zono-master-sync/route.ts                 # master cron (CRON_SECRET)
```

## 2. Files modified

- `src/lib/supabase/types.ts` — Row types + `TableShape` entries for the 2 new tables.
- `vercel.json` — added `/api/cron/zono-master-sync` at `0 1 * * *` (existing crons kept).
- `src/app/(app)/page.tsx` — `after()` non‑blocking `dashboard_load` trigger (stale > 15 min).
- `src/app/(app)/properties/ExternalListingsView.tsx` — manual "סנכרן עכשיו" now calls `runManualSyncOrchestratorAction()` after the chunked sync finishes.

## 3. Database migration added

`20260780120000_zono_orchestrator.sql`:
- **`zono_orchestrator_runs`** — id, organization_id, user_id, trigger, source, status(running/success/partial/failed/skipped), started_at, finished_at, duration_ms, steps(jsonb), error, metadata + 3 indexes.
- **`zono_orchestrator_locks`** — organization_id (PK), locked_at, lock_token, expires_at, trigger, created_by + expiry index.
- RLS via `current_org_id()` + `has_min_role('agent')` (same pattern as `agency_report_exports`). Service‑role (cron) bypasses RLS.

## 4. Routes that now trigger the orchestrator

| Trigger | Where | Behaviour |
|---|---|---|
| `manual_sync` | `ExternalListingsView` after chunked sync | bridge + events + alerts + snapshots + brain + revalidate (scrape already done) |
| `dashboard_load` | `(app)/page.tsx` via `after()` | runs only if stale > 15 min and no active run; non‑blocking; no revalidate |
| `scheduled_cron` | `/api/cron/zono-master-sync` (01:00) | full per‑org pipeline incl. scrape + transactions |
| `login` | delegated to `dashboard_load` | the first dashboard render after login triggers it (login never blocked) |

## 5. Does manual sync now create…?

After "סנכרן עכשיו" completes:
- ✅ **market_property_sources** — bridge upserts every active external listing (unique provider+external_id).
- ✅ **market_property_events** — `new_property` for first‑seen sources, `price_drop` when price fell ≥2% or ≥₪50k.
- ✅ **property_alerts** — org‑scoped, `unread`, high/urgent for private‑owner / high‑opportunity new listings and all price drops (capped 50/run to avoid spam).
- ✅ **Smart popups** — `PropertyRadarPopup` (already mounted in `(app)/layout.tsx`) reads unread high/urgent `property_alerts` via realtime + polling → it now has fresh alerts to show. (Popup UI unchanged.)
- ✅ **Heatmap / Market Intelligence** — `generateMarketSnapshotsForOrganization()` runs (session‑scoped step).
- ✅ **Decision Brain / Command Center** — `initializeOrganizationDecisionBrain()` runs.
- ✅ **Dashboard refresh** — `revalidateZonoRoutes()` revalidates `/ , /properties, /market, /command, /property-radar, /recommendations, /buyers, /sellers, /deals, /valuation`.

## 6. Dashboard‑load stale trigger

✅ Yes. `(app)/page.tsx` schedules `runOrchestratorForSession("dashboard_load", { skipRevalidation:true })` in `after()`. The orchestrator checks `msSinceLastSuccessfulRun`; if < 15 min → `skipped`. If a run is active → lock returns null → `skipped`. Never blocks render.

## 7. Cron full pipeline

✅ `/api/cron/zono-master-sync` verifies `CRON_SECRET`, loops `organizationsWithActiveLocalities()`, runs `runZonoOrchestrator({ trigger:"scheduled_cron", force:true })` per org → external scrape + transactions + bridge + events + alerts. (Snapshots/brain are session‑scoped → reported `skipped` under cron; they refresh on the next dashboard load — see §9.)

## 8. Revalidation coverage

✅ Includes all intelligence pages (10 routes listed above) via `ZONO_REVALIDATE_ROUTES`.

## 9. Remaining separate / honest limitations

- **Snapshots + Decision Brain under cron.** `generateMarketSnapshotsForOrganization()` / `initializeOrganizationDecisionBrain()` are session‑scoped (take no orgId). Under the service‑role cron they're marked `skipped` (no fake data); they recompute on the next dashboard load for that org. *Future:* add an optional `orgId` param to run them service‑role from cron too.
- **Buyer matching / recommendations** — step returns `skipped` ("Service not wired into orchestrator yet"); not faked.
- **Government deals** still flow through their own `refreshRecentTransactionsForOrganization` (now called inside the orchestrator for cron + manual), not merged with external_listings.
- **Locking** is a lightweight DB lock (insert‑or‑expire), not an advisory lock; the 10‑min expiry + `force` take‑over of expired locks keeps it safe.

## 10. Acceptance criteria

✅ Manual sync no longer only imports `external_listings` · ✅ also updates `market_property_sources` · ✅ new listings → `new_property` events · ✅ price changes → `price_drop` events · ✅ events create `property_alerts` · ✅ `PropertyRadarPopup` can display them · ✅ heatmap/market refresh after sync (session) · ✅ dashboard/command/market revalidated · ✅ login/dashboard trigger only when stale · ✅ master cron runs full orchestration per org · ✅ all typed · ✅ no fake data · ✅ no UI redesign · ✅ no broken flows.

---

## How to test manually

1. Deploy the new HEAD; in Supabase run the SQL handover (below).
2. Go to **/properties → נכסים חיצוניים** tab → click **סנכרן עכשיו** (fast 50/city). Watch counters fill; the toast now also reports `· N אירועי נכס · M התראות`.
3. Inspect tables (Supabase SQL editor):
   - `select * from zono_orchestrator_runs order by started_at desc limit 5;` → a `manual_sync` row, status `success`/`partial`, with a `steps` JSON array.
   - `select count(*) from market_property_sources;` → should be > 0 after sync.
   - `select event_type, count(*) from market_property_events group by 1;`
   - `select alert_type, priority, status from property_alerts where status='unread' order by created_at desc limit 20;`
4. **Popup:** with an unread high/urgent alert present, the `PropertyRadarPopup` should surface it (rate‑limited to 3/10min).
5. **Dashboard stale trigger:** wait > 15 min, load `/` → a `dashboard_load` run appears in `zono_orchestrator_runs`; loading again within 15 min → a `skipped` run (or none).
6. **Cron:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/zono-master-sync` → JSON with per‑org `status` + `steps`.

### Routes to test
`/properties` (external tab), `/` , `/market`, `/command`, `/property-radar`.

### Supabase tables to inspect
`zono_orchestrator_runs`, `zono_orchestrator_locks`, `market_property_sources`, `market_property_events`, `property_alerts`, `external_listings`.

### Environment variables
`CRON_SECRET` (master cron auth), `APIFY_TOKEN` + `YAD2_ACTOR_ID` + `MADLAN_ACTOR_ID` (scrape), Supabase service‑role key (already configured). No new env vars introduced.
