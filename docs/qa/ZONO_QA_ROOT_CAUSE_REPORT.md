# ZONO — QA Root-Cause Report

Confirmed root causes only. Each is backed by code (`file:line`), a production DB query, and/or a live runtime capture. Hypotheses that were investigated and **rejected** are listed at the end so we don't fix the wrong thing.

---

## RC-1 · Blank market map — MapTiler style 403 in production + non-painting OSM fallback (CONFIRMED)

**Chain of evidence.** The map is MapLibre GL over an env-configured style (`src/lib/maps/map-style.ts:76-92`). In production `NEXT_PUBLIC_MAP_STYLE_URL` is set to a MapTiler style URL. Live console capture (`/market-intelligence/map`, 2026-08-02 19:54):

```
[ZonoMap] NEXT_PUBLIC_MAP_STYLE_URL could not be loaded (HTTP 403) —
falling back to OSM raster so the map still renders.
Check the provider key/URL: https://api.maptiler.com/maps/base-v4/style.json?key=…
```

The MapTiler style request returns **403** (invalid / expired / domain-restricted key). The code then falls back to OSM raster — but a screenshot shows the map still blank, and on reload **no tile requests fire at all**, so the OSM fallback is not actually painting. Two aggravating code facts: tile-fetch errors that occur *after* the map's `load` event are deliberately swallowed (`ZonoMap.tsx:216-218`), so the failure surfaces only as a console warning, never as a user-facing error state.

**Why the QA "empty data" alternative is ruled out.** The live feed only renders inside the `data.points.length > 0` branch (`LiveMarketMapView.tsx:191,210`); QA saw a full feed, so points exist and reach `ZonoMap` — the component and its data work. The failure is tile delivery, not data.

**Smallest correct fix.** (a) Restore a valid MapTiler key with `zono-os-ro2s.vercel.app` in its domain allowlist (config, not code); (b) make the OSM raster fallback genuinely paint (verify tile requests locally); (c) convert the swallowed post-`load` provider failure into a visible error state so a future outage is never silently blank.

---

## RC-2 · False offline banner — `navigator.onLine` reliance without re-sync (CONFIRMED; QA cause rejected)

**What it is not.** The QA report attributed the toast to a transient server-action `TypeError: network error` flipping a global offline flag. **No such wiring exists.** The toast string lives only in `PwaProvider.tsx:41`; its state comes solely from `navigator.onLine` + the window `online`/`offline` events (`:12,22-26`). Server-action/query errors are routed to a **separate local** banner via `useActionRunner.ts:66-67` → `ActionFeedback.tsx`. Nothing connects request failures to offline state.

**What it actually is.** `PwaProvider` trusts raw `navigator.onLine` (a well-known false-positive source in proxied/webview/PWA runtimes) and never re-reads it on mount or on visibility/focus (contrast the sibling `VisitMode.tsx:26`, which calls `upd()` immediately). A single spurious/missed native `offline`→`online` transition therefore latches the banner until the next native toggle. Secondary: the offline queue (`offlineQueue.ts`) has **zero callers**, so `pending` is always 0 and the `pending>0` branch is dead.

**Smallest correct fix.** In `PwaProvider`'s effect, re-sync `setOnline(navigator.onLine)` on mount and on `visibilitychange`/`focus`; keep server-errors on their existing separate channel. Optionally introduce a small `online/degraded/offline/recovering` model **only** if a probe-based signal is added — do not add the state machine for its own sake.

---

## RC-3 · Valuation "completed ₪0" — unconditional status + list ignoring the availability flag (CONFIRMED; QA cause partially rejected)

**DB evidence (prod).** `property_valuations`: 9 completed, **6 with `estimated_value=0`**, 0 null. Three of the six carry `metadata.valuationAvailable=false` with reason *"לא נמצאו עסקאות או מודעות עם מחיר להשוואה"* (no priced comparables); three legacy rows have **no flag at all**. The cities are present (`קרית ביאליק`, `קרית טבעון`) — so the QA "missing city" cause is wrong for these rows.

**Code evidence.** The engine is honest: on no-comparables it returns `estimatedValue:0` paired with `valuationAvailable:false, valuationQuality:"insufficient"` and refuses to print ₪0 in prose (`valuation-engine.ts:560-576,368-378`). The detail view respects the flag (`ValuationResultView.tsx:94`). **Two defects break that honesty downstream:**
1. **Status is unconditional** — `persistResult` writes `status:"completed"` regardless of `valuationAvailable` (`service.ts:281`).
2. **List drops the flag** — `listValuations` selects only `estimated_value/confidence_level/status` (`service.ts:434-441`); `page.tsx:76` renders `0`→"₪0" and `:78-80` shows "הושלם" for any `status='completed'`.

**Soft leak.** `listing-agent/service.ts:83` sets `available:true` unconditionally; downstream consumers re-guard on `estimatedValue>0`, so nothing breaks today, but a future consumer trusting `available` would ingest a ₪0.

**Smallest correct fix.** List: read availability and render "לא חושב"/"—" instead of ₪0 (kills the visible bug). Status: set `insufficient_data` when `valuationAvailable===false` and map it in the pill + detail. Legacy: reclassify the 3 flagless rows via a reviewed migration (see migration-preview doc). Validation gap (RC-3b) is separate.

**RC-3b · Wizard validation gap (CONFIRMED).** `ValuationWizard.next()` advances with no field check (`:65,201-204`); the required `עיר *` is decorative; there is no server-side validation on the create path (`validateInput()` exists at `valuation-engine.ts:60` but is never called). Fix: block step-1 advance without city and validate server-side in `createAndRunValuationAction`.

---

## RC-4 · Location fragmentation — free-text city strings, no canonical FK on write (CONFIRMED)

**DB evidence (prod).** The same locality is split by language across the two highest-volume tables: `external_listings.city="Kiryat Bialik"` (English) ×**1335** vs `properties.city="קרית ביאליק"` (Hebrew) ×5 and `property_valuations` ×6; and split by spelling *within* valuations: `קרית ביאליק` ×6 vs `קריית ביאליק` ×2. A canonical reference exists and is unused on write: `israel_localities` (**1306 rows, 1302 with English**, keyed by CBS `locality_code`).

**Code evidence.** Primary records store free-text `city` with no FK (`properties`, `external_listings`, `property_valuations`, `territory_profiles`). The only canonicalizer, `canonicalCityName` (`transactions/providers.ts:47`), is scoped to the transactions pipeline and handles just the `קרית→קריית` case + 80 large cities — not Hebrew↔English or typos. Territory/graph aggregate on bare `c.trim()` (`territory/service.ts:31`). Even the `LocalityPicker` stores `name_he` text, not the id/code (`LocalityPicker.tsx:92`). The fragmentation is already self-diagnosed by internal QA detectors (`valuation/diagnostics.ts:99` `CITY_NORMALIZATION_MISMATCH`) but never remediated.

**Smallest correct fix.** A canonical location-resolution layer that maps free-text city (Hebrew/English/variant) → `israel_localities.locality_code`, applied high-confidence-only with a reviewed migration + rollback, and used on write going forward. Full design in `docs/data/location-entity-resolution-audit.md`.

---

## RC-5 · Counter-vs-content — independent count/list sources, per screen (CONFIRMED; QA "one shared function" rejected)

Mission Control: header counts `ex.opportunitySignals.length` but the list renders `ex.listings.filter(score≥70)` — two arrays built separately (`DailyBrief.tsx:87,134-137`; `intelligence-explorer/service.ts:50,57`). Marketplace: header counts `kind==='buyer_match'`, but `classify.ts:67-68` labels a listing `'acquisition'` when it has *any* acquisition signal even if `buyerMatches>0`, so it's excluded from the count while its card still prints "N קונים מתאימים". There is **no shared counter** — the fix is to make each header derive from the same predicate/array its list uses.

---

## RC-6 · Prediction 100%-on-0-leads — empty-population guard checks object presence, not population (CONFIRMED)

`forecast.ts:161` guards `if (!perf && !leads.length)`, but `perf` is always a non-null object (`broker-workspace/assemble.ts:206`), so the guard never fires. With an empty population, `assemble.ts:195` yields `followUpRatePct=0`, and `forecast.ts:163` computes `100 - 0 = 100`, `suff="high"` → `confidence=CAP.high=88`. The `0` is overloaded ("empty" vs "0% followed up"). Fix: treat empty population as insufficient by threading the population size into the guard; apply the same to `broker_overload` (`:147`).

---

## RC-7 · Owner-as-buyer — no self-exclusion in ingestion or matching (CONFIRMED)

DB: `buyers` contains `טל זטלמן` (0546365333, created 2026-06-19, manual) and `ארז זטלמן`. Code: comment→lead ingestion turns any author into a buyer lead with no agent/owner check (`comment-lead-bridge-core.ts:40-51`); matching cross-joins buyers×properties with no identity exclusion (`matching-intelligence/service.ts:83`, `external-listings/deal.ts:124`). Fix: exclude the acting agent/owner identity (by stable id, and by name/phone on ingestion) from match generation and from lead creation.

---

## RC-8 · Inconsistent dedup — mismatched keys + an un-deduped operations lane (CONFIRMED; QA "Daily has no dedup" refined)

Daily OS **is** deduped, on `entityType:entityId:actionClass` (`priority.ts:35-37`; `daily-os/assemble.ts:83`); Executive dedups on `rec.id` (`OfficeIntelligencePanel.tsx:38`). Duplicates persist because different entities with similar text ("גפן 29" property vs "הגפן" street) get different keys, and the `operations` lane (incl. `acquisitionStreets`, `assemble.ts:125`) bypasses the canonical dedup. Fix: route the operations lane through the same dedup and add address/street canonicalization to the key (ties to RC-4).

---

## Rejected hypotheses (investigated, found incorrect)

| QA hypothesis | Verdict | Correct cause |
|---|---|---|
| Server-action error flips global offline | **Rejected** | `navigator.onLine` reliance without re-sync (RC-2) |
| One shared broken count function | **Rejected** | Independent per-screen count/list mismatches (RC-5) |
| Uniform placeholder score 88 in Marketplace | **Rejected** | Scores computed & distributed; missing scale label (registry P1-5); 88 is a separate prediction-confidence cap |
| Missing city causes ₪0 valuations | **Partially rejected** | City present; ₪0 = no priced comparables; display + status defects (RC-3) |
| Daily OS has no dedup | **Rejected** | Daily is deduped on a different key; operations lane bypasses it (RC-8) |
| Map and graph share one root cause | **Rejected** | Map = tile-provider 403 (RC-1); graph = missing renderer + fragmentation (registry P2-1) — independent |
