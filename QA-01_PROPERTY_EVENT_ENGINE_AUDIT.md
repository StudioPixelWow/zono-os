# PHASE QA‑01 — Full Property Event Engine Audit

**Scope:** read‑only engineering audit. **No code was modified.**
**Date:** 2026‑06‑26
**Verdict in one line:** The data‑ingestion half works; the *reactive* half (events → popups → live dashboard refresh) is **not wired to the ingestion half**. They are two parallel systems that don't talk to each other, and almost nothing runs automatically except a single nightly cron.

---

## 0. The single most important finding

There are **two separate, parallel pipelines** that were never connected:

| Pipeline | Writes to | Triggered by | Emits events? |
|---|---|---|---|
| **A — External Listings sync** (`src/lib/external-listings/service.ts`) | `external_listings` (per‑org) | nightly cron `external-listings-sync` + manual "סנכרן עכשיו" | ❌ **No** |
| **B — Property Radar engine** (`src/lib/property-radar/**`) | `market_property_sources`, `market_property_events`, `property_alerts` (shared cache) | nightly cron `property-radar-sync` (separate) | ✅ Yes |

The Smart Popups, events and alerts are produced **only by pipeline B**. When you click "סנכרן עכשיו" you are running **pipeline A**, which never feeds B. So: properties get imported, but **no events, no popups, and no dashboard cascade** are produced by that import. Government deals are a **third** separate pipeline (`transactions-refresh` cron).

---

## 1. Expected flow — step‑by‑step status

| # | Step | Status | Where |
|---|---|---|---|
| 1 | User enters dashboard | ✅ Working | `src/app/(app)/layout.tsx` |
| 2 | Authentication completed | ✅ Working | `src/lib/auth/actions.ts` (`signIn`), `src/middleware.ts` |
| 3 | Organization loaded | ✅ Working | `getDashboardContext()` in `(app)/layout.tsx` |
| 4 | **Background sync starts automatically** | ❌ **Broken** | nothing triggers sync on login/load — see §2 |
| 5 | Yad2 provider | ✅ Working | `external-listings/providers.ts` → `Yad2Provider` |
| 6 | Madlan provider | ✅ Working | `external-listings/providers.ts` → `MadlanProvider` |
| 7 | Government Deals provider | ⚠ Partial / separate | `src/lib/transactions/providers.ts` — **not in this flow** |
| 8 | Normalization | ✅ Working | `ApifyProvider.normalizeListing()` |
| 9 | Duplicate detection | ⚠ Partial | `service.ts → detectDuplicates()` (external only; not transactions) |
| 10 | Merge with internal properties | ❌ Not implemented | separate tables; manual `promoteExternalListing()` only |
| 11 | Save new data | ✅ Working | `service.ts → upsertListings()` |
| 12 | Update Market Intelligence | ❌ Broken (not auto) | `market/service.ts` never called after sync |
| 13 | Trigger Property Events | ❌ Broken | sync never calls the event engine |
| 14 | Trigger Notification Engine | ❌ Broken | depends on #13 |
| 15 | Show Smart Popups | ⚠ Partial | popup UI works, but has no fresh events to show |
| 16 | Refresh Dashboard widgets | ❌ Broken | only `/properties` is revalidated |
| 17 | Refresh Heatmap | ❌ Broken | reads stale `market_area_snapshots` |
| 18 | Refresh Valuation Engine | ⚠ N/A | independent of sync |
| 19 | Refresh AI recommendations | ❌ Broken | precomputed; not re‑run after sync |

---

## 2. Audit — Automatic External Sync (login / refresh / scheduled)

**Expected:** sync on every login, every dashboard refresh, and on schedule.
**Reality:** only the nightly cron runs. Login and dashboard do **not** sync.

### (a) On login → ❌ Does NOT happen
- `src/app/(auth)/login/page.tsx`, `(auth)/layout.tsx`, `src/middleware.ts`, `(app)/layout.tsx` contain **zero** sync calls. Auth only manages the session and redirects.
- **Expected:** authentication completes → background sync kicks off.
- **Actual:** nothing is triggered; the user lands on a dashboard showing whatever the last cron/manual run left.

### (b) On dashboard refresh → ❌ Does NOT happen
- `src/app/(app)/page.tsx` is `dynamic = "force-dynamic"` — it **reads** live DB data each render but never calls `runImport()`.
- `ExternalListingsView.tsx` `useEffect` (≈ lines 185‑196) only **resumes polling** if a sync is already running; it never starts one.

### (c) Scheduled → ✅ Works (this is the only automatic trigger)
- `vercel.json`: `{ "path": "/api/cron/external-listings-sync", "schedule": "0 2 * * *" }` → **02:00 UTC daily**.
- `src/app/api/cron/external-listings-sync/route.ts`: `CRON_SECRET` Bearer guard → `organizationsWithActiveLocalities()` → `syncExternalListingsForOrganization(orgId)` per org (service‑role client). `runtime="nodejs"`, `maxDuration=300`.
- **Two more separate crons exist:** `property-radar-sync` (events) and `transactions-refresh` (gov deals). They are independent and each needs `CRON_SECRET`.

### (d) Manual "סנכרן עכשיו" → ✅ Works (user‑initiated)
- `ExternalListingsView.startSync()` → `syncNowAction()` → `doSync()` → `runImport()` → `syncOrg()`.
- Governed by `properties/page.tsx` `maxDuration=300` (fixed earlier).

### Throttling / concurrency
- **No DB lock** prevents concurrent jobs. The only guard is a **4‑minute staleness window** in `getSyncProgress()` that auto‑closes orphaned `running` jobs so the UI doesn't hang and the next run isn't blocked.

---

## 3. Audit — Smart Notification / Event chain

**Expected:** every import or change → create → store → queue → popup generated → popup displayed, for 9 event types.

### Event matrix (against pipeline B, the radar engine)

| Event type | Created | Stored | Queued | Popup gen | Displayed |
|---|---|---|---|---|---|
| New property | ❌ | ❌ | ❌ | ❌ | ❌ |
| Price reduction | ✅ | ✅ | ✅ | ✅ | ✅ |
| Returned to market | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exclusive listing | ❓ defined, never emitted | ❓ | ❓ | ❓ | ❓ |
| New opportunity | ✅ | ✅ | ✅ | ✅ | ✅ |
| Similar property | ❌ | ❌ | ❌ | ❌ | ❌ |
| Buyer match | ✅ | ✅ | ✅ | ✅ | ✅ |
| New government deal | ❓ not wired to events | ❓ | ❓ | ❓ | ❓ |
| Competitor activity | ❌ | ❌ | ❌ | ❌ | ❌ |

### What actually works (when pipeline B's cron runs)
- **Diff engine:** `property-radar/events/diff.ts → detectPropertyChanges()` — price drop (≥2% or ₪50k), back‑on‑market, severity tiers. ✅
- **Store:** `property-radar/events/repository.ts → insertMarketEvent()` → `market_property_events`. ✅
- **Queue → alert:** `events/alerts.ts → buildMarketEventAlert()` → `market/repository.ts → insertMarketAlert()` → `property_alerts`. ✅
- **Popup generated:** `components/property-radar/PropertyRadarPopup.tsx` + `PropertyRadarAlertProvider.tsx`, **mounted in `(app)/layout.tsx` line ~33**. ✅
- **Displayed:** `usePropertyRadarAlerts(orgId)` reads unread high/urgent alerts, **Supabase realtime channel** `property_radar_alerts:${orgId}` + 30s polling fallback, rate‑limited to 3 popups / 10 min. ✅

### Why the chain is effectively broken end‑to‑end
1. **❌ Ingestion never emits events.** `external-listings/service.ts → syncOrg()` upserts to `external_listings` and writes price history to `external_listing_history`, but **never imports or calls** `property-radar/events/*`. So the events table has nothing new to react to after a normal sync.
2. **❌ Two different caches.** Events are computed from `market_property_sources` (pipeline B), but the listings you import land in `external_listings` (pipeline A). They are never reconciled.
3. **❌ "New property" event is never created** even inside pipeline B — first insert records the source but emits no `DetectedMarketEvent`.
4. **❌ Exclusive / government‑deal / similar / competitor events** are not implemented in the diff engine.
5. **⚠ Timing:** even the working events only fire during pipeline B's **daily** refresh — never immediately on import.

**Dependency chain that breaks:**
`syncOrg() → upsertListings()` ⟶ *(no link)* ⟶ `events/engine.ts` ⟶ `insertMarketEvent` ⟶ `buildMarketEventAlert` ⟶ `property_alerts` ⟶ realtime ⟶ `PropertyRadarPopup`. The very first arrow is missing.

---

## 4. Audit — Dashboard widgets not refreshing after sync

**Root cause:** after a sync, `external-listings/actions.ts → doSync()` calls **only** `revalidatePath("/properties")`. Nothing else is revalidated, and the intelligence widgets read **precomputed snapshot tables** that a sync never regenerates.

### Per‑widget verdict
| Widget | Refreshes after sync? | Why | File |
|---|---|---|---|
| Hero / featured | ❌ | `/` not revalidated | `(app)/page.tsx` |
| Heatmap | ❌ | reads `market_area_snapshots` (stale) + `/market` not revalidated | `market/service.ts → getCurrentMarketHeatmap()` |
| Market Intelligence | ⚠ | reads live `external_listings` *and* stale snapshots | `market/service.ts` |
| Command Center | ❌ | stale snapshots + `/command` not revalidated | `decision-intelligence/service.ts → getExecutiveCommandCenter()` |
| Property Radar | ❌ | `/property-radar` not revalidated | `property-radar/live/*` |
| Valuation | ⚠ N/A | independent of external listings | `valuation/service.ts` |
| Smart Recommendations | ❌ | precomputed table; `/recommendations` not revalidated | `recommendations/service.ts` |
| AI widgets / Decision Brain | ❌ | read stale snapshots; brain not recomputed | `decision-intelligence/service.ts` |

### Mechanics
- All these pages are `dynamic = "force-dynamic"`, so the **only** reason they look stale is that (a) the route isn't revalidated after sync, and (b) the underlying numbers come from snapshot tables (`market_area_snapshots`, `recommendations`, decision‑brain tables) that are regenerated by **separate jobs / the manual "recalc" button** (`market/actions.ts → recalcMarketHeatmapAction()` → `generateMarketSnapshotsForOrganization()` + `initializeOrganizationDecisionBrain()`), never automatically post‑sync.
- No React Query / SWR anywhere — it's pure RSC + `router.refresh()`. After sync the client calls `router.refresh()`, which only re‑renders the **current** `/properties` page, not the dashboard.

---

## 5. Consolidated list of broken links (the wiring that's missing)

1. **No auto‑sync on login/dashboard** — only the 02:00 cron. *(service layer has no trigger from auth/layout/home.)*
2. **Sync → Market snapshots:** `syncOrg()` never calls `generateMarketSnapshotsForOrganization()`.
3. **Sync → Decision Brain:** `syncOrg()` never calls `initializeOrganizationDecisionBrain()`.
4. **Sync → Event engine:** `syncOrg()` never calls `property-radar/events/engine`. (The two pipelines and their two caches are disconnected.)
5. **Sync → revalidation:** `doSync()` revalidates only `/properties`, not `/`, `/market`, `/command`, `/property-radar`, `/recommendations`.
6. **Gov deals not in flow:** transactions/GovMap is a third pipeline on its own cron, not merged into the property flow.
7. **No external↔internal merge:** `external_listings` and `properties` stay separate; combining is manual via `promoteExternalListing()`.
8. **Event types missing:** new‑property, exclusive, similar, competitor, government‑deal events are defined but never emitted.

---

## 6. Recommended fix sequence (NOT executed — for the next phase)

1. After a successful `syncOrg()`, chain (best‑effort, non‑blocking): `generateMarketSnapshotsForOrganization()` → `initializeOrganizationDecisionBrain()` → property‑radar event detection on the freshly‑changed listings.
2. Make the event engine read from the **same** data the sync writes (`external_listings`), or have the sync write into `market_property_sources` so the diff/event engine sees it.
3. Broaden `revalidatePath` in `doSync()` to the dashboard + intelligence routes.
4. Decide on the "automatic on login/refresh" requirement: either a lightweight "sync if stale > N hours" guard invoked from the dashboard, or keep it cron‑only and document it. (Cron‑only is safer for Apify cost/time.)
5. Implement the missing event types (new‑property, exclusive, similar, competitor, gov‑deal) in the diff/event engine.
6. Unify the 3 crons (external‑listings, property‑radar, transactions) into one orchestrated nightly job so all three caches refresh together.

*End of QA‑01 report. No code changed.*
