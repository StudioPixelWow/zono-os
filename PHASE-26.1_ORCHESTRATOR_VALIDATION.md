# PHASE 26.1 — Orchestrator Validation & Integration QA

Read-only validation of the ZONO Orchestrator (Phase 26 + 26.0.1). **No features added, no UI changed, no files changed** — every item passed inspection.

---

## 1. PASS / FAIL table

### Core subsystems
| # | Subsystem | Status | Evidence |
|---|---|---|---|
| 1 | Manual sync | ✅ PASS | `ExternalListingsView.startSync` → chunks → `finishSyncJobAction` → `runManualSyncOrchestratorAction()` (`force`, `skipExternalSync`) |
| 2 | Dashboard stale auto-sync | ✅ PASS | `(app)/page.tsx` `after()` → `runOrchestratorForSession("dashboard_load",{skipRevalidation})`; staleness gate < 15 min → skip |
| 3 | Master cron | ✅ PASS | `/api/cron/zono-master-sync` CRON_SECRET → loop orgs → `runZonoOrchestrator({trigger:"scheduled_cron",force:true})` |
| 4 | External→Market bridge | ✅ PASS | `events.ts syncExternalListingsToMarketSources` upsert `market_property_sources` onConflict `provider,external_id` |
| 5 | Market snapshots | ✅ PASS | cron path runs `generateMarketSnapshotsForOrg(orgId)` (service-role, org-scoped) — **not skipped** |
| 6 | Decision Brain | ✅ PASS | cron path runs inside `runWithServiceRoleOrg(orgId, initializeOrganizationDecisionBrain)` — **not skipped** |
| 7 | Property events | ✅ PASS | `emitMarketEventsAndAlerts` → `market_property_events` (`new_property`, `price_drop`) |
| 8 | Property alerts | ✅ PASS | inserts `property_alerts` (org-scoped, unread, high/urgent) |
| 9 | Smart popups | ✅ PASS | `PropertyRadarAlertProvider` mounted in `(app)/layout.tsx`; `usePropertyRadarAlerts` reads unread high/urgent via realtime+poll |
| 10 | Route revalidation | ✅ PASS | `ZONO_REVALIDATE_ROUTES` = 10 routes (`/ , /properties, /market, /command, /property-radar, /recommendations, /buyers, /sellers, /deals, /valuation`) |

### Flow: `external_listings → market_property_sources → market_property_events → property_alerts → PropertyRadarPopup`
✅ PASS — each hop is wired (bridge → events → alerts → realtime popup). The first hop (the gap QA-01 found) is closed by the orchestrator bridge.

### Additional safety/correctness checks
| Check | Status | Evidence |
|---|---|---|
| `zono_orchestrator_runs` created correctly | ✅ PASS | `createRunRow` after org-load; `finalizeRunRow` writes status/duration/steps |
| Locks created + released | ✅ PASS | `acquireOrchestratorLock` (insert PK), released in `finally` with token |
| Duplicate concurrent runs prevented | ✅ PASS | PK `organization_id` insert conflict → valid lock → `acquire` returns null → `skipped` |
| Expired locks handled | ✅ PASS | `force` take-over of expired lock via `update … .lt("expires_at", now)`; 10-min TTL |
| Manual sync does not duplicate listings | ✅ PASS | `upsertListings` onConflict `org_id,source,source_id` |
| Cron runs without session | ✅ PASS | service-role client + `runWithServiceRoleOrg`; no `cookies()`/auth required |
| `market_snapshots` success (not skipped) under cron | ✅ PASS | step always runs; cron variant = `generateMarketSnapshotsForOrg(orgId)` |
| `decision_brain` success (not skipped) under cron | ✅ PASS | step always runs; cron variant wrapped in service-role org context |
| `new_property` events idempotent | ✅ PASS | only `freshNew` (new source this run) AND no prior `new_property` event (guard set) |
| `price_drop` events idempotent | ✅ PASS | bridge updates the source price → a re-run sees no further drop |
| `property_alerts` not duplicated | ✅ PASS¹ | new-property alerts only for `freshNew`; price-drop only when price actually fell; per-org lock prevents concurrent emits |
| Revalidation covers all ZONO intelligence routes | ✅ PASS | 10/10 routes present |
| Dashboard load runs only when data > 15 min old | ✅ PASS | `msSinceLastSuccessfulRun < ORCHESTRATOR_STALE_MS(15m)` → `skipped` |
| No service-role code reachable from client | ✅ PASS | no `"use client"` file imports `createServiceRoleClient`/`server-context`/orchestrator `service|events|locks`; UI uses only the `"use server"` action |
| No cross-organization leakage possible | ✅ PASS | `gatherOrgData` now filters all 32 reads by verified `org_id`/`organization_id`; `build*`/repos pass org_id explicitly; bridge/events/locks/runs scoped by org |

¹ Idempotency of alerts is enforced by **detection logic + the per-org lock**, not a DB unique constraint — see Remaining risks.

---

## 2. Files inspected
- `src/lib/orchestrator/{service,events,locks,repository,revalidation,triggers,logger,actions,index,types}.ts`
- `src/lib/supabase/{server,server-context}.ts`, `src/lib/auth/session.ts`
- `src/lib/decision-intelligence/service.ts` (gatherOrgData scoping), `src/lib/market/service.ts` (`generateMarketSnapshotsForOrg`)
- `src/app/api/cron/zono-master-sync/route.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/properties/ExternalListingsView.tsx`
- `src/components/property-radar/{PropertyRadarAlertProvider,usePropertyRadarAlerts}.*`, `src/app/(app)/layout.tsx`
- `supabase/migrations/20260780120000_zono_orchestrator.sql`

## 3. Files changed
**None.** No critical issue was found, so per the "fix only if critical" rule nothing was modified.

## 4. Supabase tables to inspect
`zono_orchestrator_runs`, `zono_orchestrator_locks`, `external_listings`, `market_property_sources`, `market_property_events`, `property_alerts`, `market_area_snapshots`, `attention_items`, `opportunity_signals`, `decision_queue`, `decision_recommendations`.

## 5. Exact manual test steps
1. Ensure the Phase-26 migration is applied and the latest HEAD is deployed.
2. `/properties` → **נכסים חיצוניים** → **סנכרן עכשיו** (quick 50/city). Counters fill; toast shows `… · N אירועי נכס · M התראות`.
3. SQL:
   - `select trigger,status,duration_ms,steps from zono_orchestrator_runs order by started_at desc limit 3;` → `manual_sync` = `success`/`partial`.
   - `select count(*) from market_property_sources;` → > 0.
   - `select event_type,count(*) from market_property_events group by 1;` → `new_property`/`price_drop`.
   - `select alert_type,priority,status from property_alerts where status='unread' order by created_at desc limit 10;`
   - `select * from zono_orchestrator_locks;` → **empty** after the run (lock released).
4. **Idempotency:** click **סנכרן עכשיו** again immediately → `new_property`/alert counts do **not** grow for unchanged listings.
5. **Popup:** with an unread high/urgent alert, `PropertyRadarPopup` appears (rate-limited 3/10 min).
6. **Stale gate:** load `/`, then reload within 15 min → newest `dashboard_load` behaviour is a no-op (no new successful run row); after 15 min a new run appears.

## 6. Exact cron test command
```
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<your-app-domain>/api/cron/zono-master-sync
```
Expect HTTP 200 + JSON where each org's `steps` shows `market_sources_bridge`, `market_snapshots`, `decision_brain`, `events_and_alerts` = `success`. (401 = wrong/missing `CRON_SECRET`.)

## 7. Remaining risks (non-blocking)
- **Alert idempotency is logic-based, not DB-enforced.** The per-org lock prevents concurrent orchestrator runs, so duplicates can't occur in practice; but there is no `unique` constraint on `property_alerts`. A future hardening could add a partial unique index on `(org_id, alert_type, (metadata->>'marketPropertySourceId'))`.
- **Expired-lock take-over requires `force`.** Manual + cron use `force` (they clear stale locks); a non-force `dashboard_load` hitting an orphaned expired lock will `skip` until the next manual/cron run clears it. Low impact (10-min TTL + cron at 01:00).
- **Cron snapshots/brain still gated by serverless time.** On very large orgs the per-org cron pass could approach the function limit; the bridge/events persist incrementally, so partial progress is retained.
- **Buyer-matching / recommendations** remain a `skipped` step (intentionally not implemented in the orchestrator; no fake data).

## 8. Production-ready?
**Yes — Phase 26 + 26.0.1 are production-ready**, conditional on the two operational prerequisites (not code):
1. Run the Phase-26 migration (`20260780120000_zono_orchestrator.sql`) in Supabase.
2. Deploy the latest HEAD and set `CRON_SECRET` (+ `APIFY_TOKEN`/actor IDs already required for scraping).

All 10 subsystems and all 16 safety checks PASS; the only residual items are non-blocking hardening opportunities listed in §7.
