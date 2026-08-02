# ZONO — Before / After Evidence Log

"Before" evidence was captured during Phase 1/2 investigation (2026-08-02) from production, the DB, and code. "After" rows are filled as each fix lands (with test output + a fresh capture). An issue is not marked resolved until its "after" row is complete.

---

## P0-1 · Map

**Before (captured 2026-08-02 19:54, prod).**
- Console: `[ZonoMap] NEXT_PUBLIC_MAP_STYLE_URL could not be loaded (HTTP 403) — falling back to OSM raster … api.maptiler.com/maps/base-v4/style.json?key=…`
- Screenshot: central LIVE MARKET MAP panel blank; right feed full.
- Network: on reload, zero tile requests → OSM fallback not painting.

**After (pending).** Expect: MapTiler style 200 (valid key + domain allowlist) OR OSM tiles 200; map paints; forced provider-failure ⇒ visible error state. Attach: console clean, tile requests 200, screenshot of rendered map, test output.

---

## P0-2 · Offline banner

**Before.** Code proof that toast is driven solely by `navigator.onLine` (`PwaProvider.tsx:12,22-26,41`), no re-sync on mount; server-action errors on a separate channel (`useActionRunner.ts:66`). Symptom: persistent "אין חיבור" toast visible on `/valuation` and `/market-intelligence/map` screenshots while data loaded.

**After (pending).** Expect: toast clears on recovery; transient failure never triggers it. Attach: test output (6 cases), DevTools offline↔online capture.

---

## P0-3 · Valuation ₪0

**Before (DB, prod).**
```
completed_total=9  completed_zero=6  completed_null=0
completed_flagged_unavailable=3  zero_and_flagged=3
```
Sample rows (city present, honest reason): `קרית ביאליק` / status=completed / estimated_value=0 / confidence=low / valuationAvailable=false / reason="לא נמצאו עסקאות או מודעות עם מחיר להשוואה"; plus 3 legacy rows with `valuationAvailable=null`.
Screenshot: `/valuation` list shows multiple "הושלם ₪0 · ביטחון נמוכה".

**After (pending).** Expect: list shows "לא חושב"/"—"; status `insufficient_data`; 3 legacy rows reclassified; failed excluded from stats. Attach: DB re-query, list screenshot, test output.

---

## P1-1 · Location fragmentation

**Before (DB, prod).**
```
external_listings.city "Kiryat Bialik" (EN) = 1335   properties.city "קרית ביאליק" (HE) = 5
external_listings.city "Kiryat Motzkin" (EN) = 101   properties.city "קרית מוצקין" (HE) = 3
property_valuations.city "קרית ביאליק" = 6  vs  "קריית ביאליק" = 2   (same table, two spellings)
israel_localities = 1306 rows (1302 with English)  ← canonical resolver target
```

**After (pending).** Expect: high-confidence rows resolved to `locality_code`; ambiguous list produced (not merged); before/after aggregate diff; graph shows one node. Attach: resolver test output, migration preview table, aggregate diff, rollback confirmation.

---

## P1-2 · Counters

**Before.** Prod screenshot `/market-intelligence/map` sidebar: "הזדמנויות היום 0" + "מודעות טריות 0" while feed full. Code: independent count/list arrays (`DailyBrief.tsx:87,134`; `marketplace/classify.ts:67`).

**After (pending).** Header == visible cards. Attach: screenshot + test.

---

## P1-3 · Prediction

**Before.** Code proof of `100 - 0 = 100`, `confidence=CAP.high=88` on empty population (`forecast.ts:161-163`, `assemble.ts:195,206`). QA screenshot: "מעקבים שיפוספסו 100% (ביטחון 88)" + "0 לידים פתוחים".

**After (pending).** 0 leads ⇒ insufficient card. Attach: screenshot + test.

---

## P1-5 · Scores

**Before (DB).** `external_listings.opportunity_score` distribution: 71×201, 56×173, 63×162, 48×153, 46×143, 81×138, 73×131, 38×83, 88×41, 96×23 … (**not** uniform — refutes "placeholder 88"). UI shows bare numbers, no scale.

**After (pending).** Score chips labeled `X/100` + breakdown. Attach: screenshot + snapshot test.

---

## P1-7 · Owner-as-buyer

**Before (DB).** `buyers`: `טל זטלמן` (0546365333) + `ארז זטלמן`, created 2026-06-19. Code: no self-exclusion (`comment-lead-bridge-core.ts:40`, `matching-intelligence/service.ts:83`).

**After (pending).** Owner excluded from matches/leads. Attach: match output + test.

---

## Remaining (P1-6 dedup, P2-1 graph, P2-2 territory)

Before evidence captured in the registry/root-cause docs. After rows filled on fix.
