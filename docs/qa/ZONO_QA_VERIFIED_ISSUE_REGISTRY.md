# ZONO — Verified Issue Registry (QA Remediation Program)

**Scope:** Turns the ZONO QA Master Review into an evidence-based engineering registry.
**Method:** Every issue was investigated with at least one of: source-code trace (`file:line`), production DB query (record-level), or live production runtime capture (console/network/screenshot). No fix is listed as done here — this is the investigation gate (Phase 1) before implementation.
**Environment:** production `https://zono-os-ro2s.vercel.app`, code @ `7096473` (branch `qa-remediation`), DB project `tlrefajhyrqnjtmimaos`. Date 2026-08-02.

**Priority-type legend:** `P0-T` technical blocker · `P0-C` commercial/launch-demo blocker · `P0-TR` trust blocker (false/misleading/contradictory) · `P1` before paying customers · `P2` important · `P3` future. An issue may carry more than one.

**Root-cause status legend:** `CONFIRMED` (evidence proves the mechanism) · `PARTIAL` (mechanism identified, one link needs runtime/DB confirmation) · `UNVERIFIED` (hypothesis only).

> **Headline:** three QA root-cause *hypotheses were refuted* by evidence (see ✗ markers): the offline toast is **not** caused by server-action failures; the counter bug is **not** one shared function; the Marketplace "uniform 88" score is **not** a placeholder. The user-visible *symptoms* are all real — the causes differ, and fixing the wrong cause would have wasted effort.

---

## ZONO-QA-P0-1 — Market map renders blank

| Field | Value |
|---|---|
| Original QA priority | P0-1 (Critical) |
| Revised eng. priority | **P0-C + P0-TR** |
| Affected route | `/market-intelligence/map` |
| Affected components | `src/components/maps/ZonoMap.tsx`, `src/lib/maps/map-style.ts`, `market-intelligence/map/LiveMarketMapView.tsx` |
| Verified symptom | Central LIVE MARKET MAP panel is blank/white; right-side live feed is full of real data. |
| Evidence | **Runtime console (prod, captured 2026-08-02 19:54):** `[ZonoMap] NEXT_PUBLIC_MAP_STYLE_URL could not be loaded (HTTP 403) — falling back to OSM raster… api.maptiler.com/maps/base-v4/style.json?key=…`. Screenshot: map panel blank. On reload, **zero** tile requests observed → OSM fallback also not painting. Code: `map-style.ts:76-92` (env-driven style/tiles), `ZonoMap.tsx:216-218` (tile errors after `load` are swallowed). |
| Root-cause hypothesis | Configured MapTiler style URL returns **HTTP 403** in production (invalid / expired / domain-restricted key); the OSM raster fallback then fails to paint, and post-`load` tile errors are swallowed → silent blank. |
| Root-cause status | **CONFIRMED** (403 proven at runtime; fallback-not-painting confirmed by absence of tile requests). |
| Reproduction | Open `/market-intelligence/map` in prod → central map blank → DevTools console shows the MapTiler 403 warning. |
| Expected | A usable map renders; distinct loading / no-data / provider-failure states; invalid records don't blank the whole map. |
| Actual | Blank canvas, no error surfaced to the user (only a console warning). |
| Data risk | None (read-only rendering). |
| Trust risk | **High** — a flagship "market map" shows nothing. |
| Commercial impact | **Blocks** the map step of the Property Acquisition Radar demo. |
| Proposed investigation | (a) Confirm the MapTiler key validity + domain allowlist for `zono-os-ro2s.vercel.app`; (b) verify the OSM raster fallback actually issues tile requests locally; (c) confirm the post-`load` error guard hides genuine tile failures. |
| Acceptance criteria | Map paints tiles on direct-nav + refresh in production config; provider failure yields a visible error state (not blank); no-data ≠ loading ≠ failure; filters update markers; one invalid coordinate does not blank the map. |
| Required automated tests | ZonoMap init test; provider-init/style-fallback test; no-data-state test; invalid-coordinate test; a production-config guard (fail build/log if neither style nor tile URL resolves). |
| Required manual tests | Prod smoke: map renders; kill the style URL → error state (not blank); refresh persists. |
| Regression surfaces | Any other `ZonoMap` embed (Heatmap tab, property detail maps, territory map). |

---

## ZONO-QA-P0-2 — False "offline" state ✗ (QA cause refuted)

| Field | Value |
|---|---|
| Original QA priority | P0-2 (from B-01/B-17) |
| Revised eng. priority | **P0-TR** |
| Affected route | Global (every `(app)` screen; toast rendered from app layout) |
| Affected components | `src/components/mobile/PwaProvider.tsx` (sole source), `app/(app)/layout.tsx:43` |
| Verified symptom | Toast "אין חיבור — צפייה במצב לא-מקוון" persists while data loads fine. |
| Evidence | Code trace: toast string only at `PwaProvider.tsx:41`; state from `navigator.onLine` + window `online`/`offline` events (`:12,22-26`); **no** server-action/query error path writes offline state (`useActionRunner.ts:66-67` routes errors to a *separate local* banner). No on-mount re-sync of `navigator.onLine` (contrast `VisitMode.tsx:26`). |
| Root-cause hypothesis (QA) | ✗ **REFUTED:** "a transient server-action `TypeError: network error` flips a global offline flag." No such wiring exists. |
| Root-cause hypothesis (actual) | Sole reliance on raw `navigator.onLine` (false-positive-prone in proxied/webview/PWA contexts) **plus** no on-mount/visibility re-sync → a single spurious/missed native offline→online transition latches the banner until the next native toggle. |
| Root-cause status | **CONFIRMED** (mechanism proven in code; the specific latch trigger is environmental — `navigator.onLine` false-positive). |
| Reproduction | Observed persistent toast in prod across screens; code proves it cannot come from request failures. |
| Expected | A single failed request never marks the app offline; success clears stale offline; server-error ≠ internet-offline; toast auto-dismisses on recovery; actionable retry when appropriate. |
| Actual | Banner can latch and not recover. |
| Data risk | None. |
| Trust risk | **High** — visible on every screen. |
| Commercial impact | Undermines the whole demo ("looks broken/offline"). |
| Proposed investigation | Confirm in prod whether `navigator.onLine` is intermittently false (webview/proxy). Decide minimal state model: `online / degraded / offline / recovering` only if it earns its complexity. |
| Acceptance criteria | Single transient failure ⇒ no offline; success after failure clears offline; real `offline` event ⇒ offline; recovery clears toast; server 5xx while online ⇒ not "offline"; survives route transitions. |
| Required automated tests | one transient failure; repeated failures; real offline event; successful recovery; server error while online; route transition after recovery. |
| Required manual tests | Toggle DevTools offline/online; confirm banner appears then clears. |
| Regression surfaces | `VisitMode` offline handling; offline queue (`offlineQueue.ts` — note: currently has **zero callers**, `pending` is effectively always 0). |

---

## ZONO-QA-P0-3 — Valuation "completed" with ₪0

| Field | Value |
|---|---|
| Original QA priority | P0-3 / G1 |
| Revised eng. priority | **P0-TR** |
| Affected route | `/valuation` (list), `/valuation/[id]` (detail), `/valuation/new` (wizard) |
| Affected components | `src/lib/valuation/service.ts` (`persistResult` `:281`, `listValuations` `:432-443`), `valuation/page.tsx:8,76,78-80`, `valuation-engine.ts:560-579` |
| Verified symptom | List shows multiple valuations "הושלם" with value **₪0** and low confidence. |
| Evidence | **DB (prod):** `property_valuations` — 9 completed; **6 with `estimated_value=0`**; 0 null; 3 carry `metadata.valuationAvailable=false` with reason *"לא נמצאו עסקאות או מודעות עם מחיר להשוואה"*; **3 legacy rows have no flag at all**. Sample cities: `קרית ביאליק`, `קרית טבעון` (city IS present). Code: engine returns honest `estimatedValue:0 + valuationAvailable:false` (`valuation-engine.ts:560-576`); detail view respects the flag (`ValuationResultView.tsx:94`); **list ignores it** (`listValuations` selects only `estimated_value` `:434-441`; `page.tsx:76` `ils(0)`→"₪0"; status pill "הושלם" whenever `status='completed'` `:78-80`). |
| Root-cause hypothesis (QA) | ✗ **PARTIALLY REFUTED:** "missing city → ₪0." City is present; compute is guarded by `canCompute` (`ValuationWizard.tsx:63,70`). The ₪0 comes from **no priced comparables**, not a missing city. |
| Root-cause hypothesis (actual) | Two independent defects: **(C)** list surface renders `0` as "₪0" because it doesn't read `valuationAvailable`; **(D)** `status` is set to `"completed"` unconditionally (`service.ts:281`) even when `valuationAvailable=false`. Legacy rows also predate the flag. |
| Root-cause status | **CONFIRMED** (DB + code). |
| Reproduction | Open `/valuation` in prod → list shows "הושלם ₪0" cards. |
| Expected | A failed valuation is marked failed/insufficient, not "completed"; missing → null/"—", not ₪0; provider/model failure explained; legacy invalid rows reclassified; failed results excluded from dashboards/stats/AI. |
| Actual | Failure presented as success with a fabricated-looking ₪0. |
| Data risk | **Medium** — legacy rows need safe reclassification (non-destructive). |
| Trust risk | **High** — a failed calculation shown as a successful result (explicit user constraint). |
| Commercial impact | AVM is secondary to launch, but "must not present failure as success" applies. |
| Proposed investigation | Enumerate all completed+0 rows; decide status taxonomy (`insufficient_data`); confirm no consumer trusts `available` alone (`listing-agent/service.ts:83` soft-leak sets `available:true` unconditionally). |
| Acceptance criteria | list never shows ₪0 for unavailable; failed status distinct from completed; retry available; legacy rows reclassified via reviewed migration; failed results excluded from stats/AI. |
| Required automated tests | missing city; invalid city; unresolved alias; incomplete property; provider timeout; provider error; null result; zero result; valid result; duplicate submission; refresh during processing. |
| Required manual tests | Run a valuation for a data-poor area → shows "לא ניתן לחשב", not ₪0-completed. |
| Regression surfaces | seller-portal valuation read (`seller-portal/service.ts:200`), listing-agent pricing (`listing-agent/valuation.ts:41`), dashboards consuming valuations. |

---

## ZONO-QA-P1-1 — Location entity fragmentation

| Field | Value |
|---|---|
| Original QA priority | G2/G5 (High, cross-system) |
| Revised eng. priority | **P1** (with P0-TR effect on the graph's "two areas") |
| Affected routes | `/graph`, `/valuation`, `/territory`, marketplace/matching |
| Affected components | `properties.city`, `external_listings.city`, `property_valuations.city`, `territory_profiles.city_name` (all free-text); canonical `israel_localities` exists but is not used on write; `transactions/providers.ts:47` (only scoped canonicalizer) |
| Verified symptom | Same city stored under multiple spellings/languages; graph shows it as two areas. |
| Evidence | **DB (prod):** `external_listings.city = "Kiryat Bialik"` (English) ×**1335**; `properties.city = "קרית ביאליק"` (Hebrew) ×5; `property_valuations` has both `קרית ביאליק` ×6 **and** `קריית ביאליק` ×2 (one-yud vs two-yud in the *same* table). Same pattern for Kiryat Motzkin/קרית מוצקין. Canonical `israel_localities`: **1306 rows, 1302 with English names** — a resolver target exists. |
| Root-cause hypothesis | Location is stored as free-text city strings with **no canonical FK on write**; the only canonicalizer (`canonicalCityName`) is scoped to the transactions pipeline (80 cities, `קרית→קריית` only) and does not handle Hebrew↔English or typos; territory/graph aggregate on bare `c.trim()`. |
| Root-cause status | **CONFIRMED** (DB + code). |
| Reproduction | `/graph` shows "קרית ביאליק" and "Kiryat Bialik" as separate area nodes. |
| Expected | Distinct geographic entities never merged on string similarity; canonical IDs used for joins/aggregation; aliases resolved; low-confidence matches queued for review; original values preserved; migration preview + rollback before any change. |
| Actual | Aggregations fragment; 1,335 English listings never join 5 Hebrew properties for the same city. |
| Data risk | **High** if done carelessly (false merges). Mitigation: preview + high-confidence-only auto-merge + manual review of ambiguous. |
| Trust risk | Medium-High (graph/territory/valuation all mislead). |
| Commercial impact | Affects Radar quality (matching, market share, comps). |
| Proposed investigation | See `docs/data/location-entity-resolution-audit.md` and `docs/data/location-migration-preview.md`. |
| Acceptance criteria | canonical `locality_code` resolved for ≥ high-confidence share; ambiguous list produced; no false merges; before/after aggregate diff; rollback ready; write-path stores canonical id going forward. |
| Required automated tests | resolver unit tests (Hebrew, English, קרית/קריית, typos, unknown → unresolved); "never merge distinct localities" test; idempotent re-run. |
| Required manual tests | Graph shows one node for Kiryat Bialik after resolution; territory aggregates merge. |
| Regression surfaces | geocoding, valuation comps, territory/graph aggregates, buyer-supply matching, search filters. |

---

## ZONO-QA-P1-2 — Counter-vs-content contradiction ✗ (QA cause refined)

| Field | Value |
|---|---|
| Original QA priority | B-14 (High) |
| Revised eng. priority | **P0-TR** (on launch-critical Mission Control + Marketplace) |
| Affected routes | `/mission-control`, `/market-intelligence/map`, `/marketplace` |
| Affected components | `mission-control/DailyBrief.tsx:87,134-137`; `marketplace/service.ts:107` + `classify.ts:67-68` |
| Verified symptom | Header shows "0" while the list below is full ("הזדמנויות היום 0" with cards; "התאמות 0" with "2 קונים מתאימים"). |
| Evidence (runtime) | Prod screenshot of `/market-intelligence/map` shows sidebar "הזדמנויות היום 0" + "מודעות טריות 0" while the feed is full. Code: Mission Control header counts `ex.opportunitySignals.length` but the list renders `ex.listings.filter(score≥70)` — **two different arrays**. Marketplace header counts `kind==='buyer_match'`, but a listing with `buyerMatches>0` **and** an acquisition signal is classified `'acquisition'` (`classify.ts:67`), so it's excluded from the count yet still prints "N קונים מתאימים". |
| Root-cause hypothesis (QA) | ✗ **REFUTED:** "one shared broken count function." There is **no** shared counter — each screen has independent count vs list sources, mismatched differently. |
| Root-cause status | **CONFIRMED** (code); exact prod numbers **PARTIAL** (need per-screen data snapshot). |
| Expected | Count and list use the same semantic query/predicate; counts reflect active filters and are labeled; empty ≠ failed; loading doesn't flash a false 0. |
| Actual | Header measures a different thing than the list. |
| Data/Trust risk | Trust **High** (self-contradiction on launch surfaces). |
| Acceptance criteria | each header count derives from the same array/predicate as its list; labeled; no false-zero on load. |
| Required tests | Mission Control: opportunities count == cards shown; Marketplace: buyerMatches header == cards with buyerMatches>0; loading-state shows no numeric 0. |
| Regression surfaces | any KPI tile reading these services. |

---

## ZONO-QA-P1-3 — Prediction contradiction (100% missed on 0 leads)

| Field | Value |
|---|---|
| Original QA priority | B-13 (High) |
| Revised eng. priority | **P1** (secondary surface; trust) |
| Affected route | `/predictions` |
| Affected components | `src/lib/prediction-engine/forecast.ts:158-171`, `src/lib/broker-workspace/assemble.ts:195,206` |
| Verified symptom | "מעקבים שיפוספסו 100% (ביטחון 88)" alongside "0 לידים פתוחים · שיעור מעקב 0%". |
| Evidence | `assemble.ts:195` `followUpRatePct = people.length ? … : 0` (0 overloaded: "empty" and "0% followed up"). `forecast.ts:161` guard is `if (!perf && !leads.length)` — but `perf` is **always** a non-null object (`assemble.ts:206`), so the guard never fires; `:163` computes `100 - 0 = 100`, `suff="high"` → `confidence = CAP.high = 88` (`forecast.ts:15`). |
| Root-cause hypothesis | Empty-population guard checks object presence (`!perf`) instead of population size; an empty population's `0%` rate is inverted to `100%` missed. |
| Root-cause status | **CONFIRMED** (code). |
| Expected | No population ⇒ "insufficient data", never 100% risk; zero denominator never yields a misleading %; population/date-window/confidence visible; contradictory metrics can't co-appear. |
| Data/Trust risk | Trust **High** on that screen. |
| Acceptance criteria | 0-population ⇒ insufficient-data card, no % risk; `broker_overload` (`forecast.ts:147`, same `100-rate` pattern) also guarded. |
| Required tests | 0 people ⇒ insufficient; N people, low follow-up ⇒ real %; stale forecast expiry. |
| Regression surfaces | `broker_overload` prediction; Daily/Executive tiles reading follow-up rate. |

---

## ZONO-QA-P1-4 — Valuation wizard validation gap

| Field | Value |
|---|---|
| Original QA priority | G3 |
| Revised eng. priority | **P1** |
| Affected route | `/valuation/new` |
| Affected components | `ValuationWizard.tsx:65,201-204` (next), `:63,70` (canCompute), `valuation/actions.ts:57` (no server validation) |
| Verified symptom | Clicking "המשיך" on step 1 advances with required "עיר *" empty. |
| Evidence | `next()` (`:65`) has no field check; the `*` is decorative. Compute IS re-guarded (`canCompute` `:63`, bounce `:70`), so this does **not** by itself create ₪0 rows — but it's a real UX/validation defect and there is **no server-side validation** (`validateInput()` exists in `valuation-engine.ts:60` but is never called on the create path). |
| Root-cause status | **CONFIRMED**. |
| Expected | Required fields block progression; server-side validation independently rejects invalid input. |
| Acceptance criteria | empty city blocks step advance; `createAndRunValuationAction` rejects missing city server-side. |
| Required tests | step-1 advance blocked without city; server action rejects missing city. |
| Regression surfaces | valuation creation flow, property-detail valuation entry. |

---

## ZONO-QA-P1-5 — Scores shown without scale ✗ ("uniform 88" refuted)

| Field | Value |
|---|---|
| Original QA priority | B-19 / G7 |
| Revised eng. priority | **P1** (clarity/trust on launch surfaces) |
| Affected | Marketplace cards, territory, opportunity scores, prediction confidence |
| Verified symptom | Scores (19/43/63/88/96) shown as bare numbers; Marketplace appeared to show a uniform 88. |
| Evidence | **DB (prod):** `external_listings.opportunity_score` is well-distributed — 71×201, 56×173, 63×162, 48×153, 81×138, …, **88×41**, 96×23. **Not uniform.** Marketplace card score is genuinely computed (`classify.ts:69` formula over `opportunityScore`). The "88" trust-cap is a *separate* hardcoded constant for prediction confidence (`forecast.ts:15 CAP.high=88`). Scores are internally 0–100 (`clamp`) but the UI shows no `/100` label. |
| Root-cause hypothesis (QA) | ✗ **REFUTED:** "uniform 88 placeholder." Scores are real and varied. |
| Root-cause hypothesis (actual) | Presentation gap: no scale label / interpretation / factor breakdown / last-updated on score chips. |
| Root-cause status | **CONFIRMED** (DB + code). |
| Expected | Every score: name, "X out of Y", short interpretation, factor breakdown, last-updated, confidence where relevant; fact vs estimate vs prediction distinguished. |
| Acceptance criteria | score chips labeled with scale + tooltip breakdown; no bare unexplained number on launch surfaces. |
| Required tests | score component renders scale + breakdown; snapshot for a known score. |
| Regression surfaces | all score chips (Marketplace, territory, deal, matching, predictions). |

---

## ZONO-QA-P1-6 — Inconsistent deduplication ✗ (QA cause refined)

| Field | Value |
|---|---|
| Original QA priority | B-15 / B-18 |
| Revised eng. priority | **P1/P2** |
| Affected | Executive, Daily OS, Home, Action Center |
| Verified symptom | "גפן 29" and "הגפן" as two items; same recruitment 36% repeated. |
| Evidence | Executive dedups on `rec.id` (`OfficeIntelligencePanel.tsx:25,38`). Daily OS **is** deduped, on `entityType:entityId:actionClass` (`priority.ts:35-37`; `daily-os/assemble.ts:83`). Duplicates persist because (a) "גפן 29" (property entity) and "הגפן" (street/acquisition item) are **different entities** → different keys, and (b) `assemble.ts:116-126` builds an `operations` lane (incl. `acquisitionStreets`) that **bypasses** the canonical dedup. |
| Root-cause hypothesis (QA) | ✗ **REFINED:** "dedup exists in Executive but not Daily." Daily's queue *is* deduped — but on a different key, and an operations lane bypasses it; no layer canonicalizes street/address text. |
| Root-cause status | **CONFIRMED** (code); exact rendered pairs **PARTIAL** (need live queue). |
| Expected | Same logical event/action doesn't repeat across surfaces unless clearly presented as views of one object; dedup keys on stable ids / canonical entity, not text. |
| Acceptance criteria | operations lane routed through canonical dedup; address canonicalization added to the key (ties into P1-1). |
| Required tests | duplicate street item appears once; cross-lane dedup. |
| Regression surfaces | Daily/Home/Executive/Action Center feeds. |

---

## Secondary issues (compact)

| Issue ID | Symptom (verified) | Route | Revised pri | Root-cause status | Key evidence / note |
|---|---|---|---|---|---|
| ZONO-QA-P1-7 | **Owner appears as own buyer** ("טל זטלמן — שלח התאמות") | daily/executive/action-center | **P1 (P0-TR)** | **CONFIRMED** | DB: `buyers` has `טל זטלמן` (0546365333) + `ארז זטלמן`, created 2026-06-19 (manual). No self-exclusion in matching/ingestion (`comment-lead-bridge-core.ts:40`, `matching-intelligence/service.ts:83`). Acceptance criterion #13 bans self-matched data. |
| ZONO-QA-P2-1 | **`/graph` visual core not rendered** ("מגיע בהמשך"); "מתווך מוביל" empty | `/graph` | **P1 exposure / P2 render** | PARTIAL | 450 entities/210 edges exist; renderer absent. Phase-10 decision: hide/beta/fallback rather than expose "coming soon" in a paid surface. |
| ZONO-QA-P2-2 | **Territory metrics all 0%** (penetration/share/coverage) | `/territory` | P2 | PARTIAL | Feature populated but shares 0 (ties to P1-1 fragmentation + no market-share data). Needs empty-state, not "0%". |
| ZONO-QA-P2-3 | **AI Coach inert** ("קיים בלבד — לא נוצרות חדשות") | action-center | P2 | UNVERIFIED | Secondary surface; confirm generator wired or mark unavailable. |
| ZONO-QA-P2-4 | **Recommendations point to blocked Facebook channel** | cross | P2 | UNVERIFIED | External-approval-gated; hide FB CTAs until channel live. |
| ZONO-QA-P3-1 | **PWA `icon-192.png` → 404** | manifest | P3 | CONFIRMED (QA) | Cosmetic; add icon. |

---

## Refuted / corrected QA hypotheses (explicit)

1. **Offline toast is caused by server-action failures** → **FALSE.** No wiring connects request/action errors to offline state; cause is `navigator.onLine` reliance without re-sync (P0-2).
2. **The counter bug is one shared broken count function** → **FALSE.** Independent, per-screen count-vs-list source mismatches (P1-2).
3. **Marketplace shows a uniform placeholder score of 88** → **FALSE.** Scores are computed and well-distributed; the real gap is a missing scale label (P1-5). The "88" is separately a hardcoded *prediction-confidence* cap.
4. **₪0 valuations are caused by the missing-city validation gap** → **PARTIALLY FALSE.** City is present; ₪0 comes from no priced comparables. The validation gap (P1-4) and the ₪0 display (P0-3) are two independent defects.
5. **Daily OS has no dedup** → **FALSE.** Daily's queue is deduped on a different key; an operations lane bypasses it (P1-6).

---

## Prioritized worklist (engineering order)

1. **P0-1** map (config + fallback + error-state) · **P0-2** offline detector · **P0-3** ₪0 display + honest status + legacy reclassification (incl. **P1-4** validation).
2. **P1-1** location entity resolution (audit → preview → high-confidence migration) — unblocks graph/territory/valuation quality.
3. **P1-2** counter parity · **P1-3** prediction empty-population guard · **P1-5** score-scale UI · **P1-7** self-match exclusion.
4. **P1-6** dedup unification · **P2-1** graph exposure decision · **P2-2** territory empty-state · remaining P2/P3.
