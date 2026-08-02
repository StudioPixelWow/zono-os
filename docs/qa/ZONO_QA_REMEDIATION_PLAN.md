# ZONO — QA Remediation Plan

The smallest correct fix per confirmed issue, sequenced, with safety rails. No fix is applied until its investigation entry in the registry is `CONFIRMED` and its acceptance criteria + tests are defined. Nothing is marked done without evidence (tests green + before/after capture).

**Safety rails (apply to every item).** No destructive production data changes. No entity merges without a reviewed migration preview. No production data edited to make tests pass. No `null → 0` substitutions. No exception swallowing to hide errors. No hardcoded counts/scores/map data/status. Feature-flag anything whose exposure carries risk. Preserve tenant isolation + RLS. Preserve working intelligence + source attribution.

---

## Stage 1 — P0 launch blockers

### P0-1 · Map
- **Config (no code):** issue/rotate a valid MapTiler key; add `zono-os-ro2s.vercel.app` to its allowed domains; set `NEXT_PUBLIC_MAP_STYLE_URL`. *This alone likely restores the map.*
- **Code:** ensure the OSM raster fallback actually issues tile requests (verify locally); convert the swallowed post-`load` provider failure (`ZonoMap.tsx:216-218`) into a visible error state distinct from loading/no-data; add a production guard that logs (or fails build) if neither style nor tile URL resolves.
- **Tests:** ZonoMap init; style-403 → fallback paints; provider-hard-fail → error state; no-data state; invalid-coordinate row doesn't blank map.
- **Blast radius:** every `ZonoMap` embed → regression-test Heatmap tab + property/territory maps.

### P0-2 · Offline detector
- **Code (`PwaProvider.tsx`):** re-sync `setOnline(navigator.onLine)` on mount + on `visibilitychange`/`focus`; keep the toast tied to real connectivity; leave server-error banner on its separate channel.
- **Tests:** transient failure ⇒ not offline; success clears stale offline; real offline event ⇒ offline; recovery clears; server 5xx while online ⇒ not offline; route transition after recovery.
- **Blast radius:** `VisitMode`, offline queue (dead today — note in PR).

### P0-3 · ₪0 valuations
- **Code (display, minimal):** `listValuations` also reads `metadata.valuationAvailable`; `page.tsx` renders "לא חושב"/"—" when unavailable or value≤0.
- **Code (status honesty):** `persistResult` sets `insufficient_data` when `valuationAvailable===false`; map the new status in list pill + detail; keep detail view behavior.
- **Data (legacy):** reviewed migration reclassifies the 3 flagless completed-₪0 rows to `insufficient_data` (see migration-preview doc) — non-destructive, reversible.
- **Validation (P1-4):** block step-1 advance without city; call `validateInput()` server-side in `createAndRunValuationAction`.
- **Tests:** missing/invalid city; unresolved alias; incomplete property; provider timeout/error; null; zero; valid; duplicate submit; refresh during processing.
- **Blast radius:** seller-portal read, listing-agent pricing, any valuation-consuming dashboard.

---

## Stage 2 — Location entity resolution (P1-1)

Audit → **preview** → high-confidence auto-map only → manual review of ambiguous → apply behind a migration with rollback → switch write-path to store canonical `locality_code`. Full plan in `docs/data/location-entity-resolution-audit.md` + `docs/data/location-migration-preview.md`. **Never merge distinct localities on string similarity.** Gate any aggregation change behind a flag until the before/after diff is reviewed.

---

## Stage 3 — Trust & consistency (P1)

- **P1-2 counters:** each header count derives from the same array/predicate as its list (Mission Control `newListings.filter(score≥70).length`; Marketplace `opportunities.filter(o=>o.buyerMatches>0).length`). Label counts. No false-zero on load (distinguish loading/empty/error).
- **P1-3 prediction:** thread population size into the `missed_followup` + `broker_overload` guards; empty population ⇒ `insufficient` card, never 100%. Show population + date window + confidence + expiry.
- **P1-5 scores:** a shared score chip that renders name + `X/100` + tooltip factor breakdown + last-updated + fact/estimate/prediction tag. No bare numbers on launch surfaces.
- **P1-7 self-match:** exclude acting agent/owner from match generation (`matching-intelligence/service.ts`, `external-listings/deal.ts`) and from comment→lead ingestion (by stable id; by name/phone at ingestion). Regression test for self-match + cross-role collision.

---

## Stage 4 — Consistency & exposure (P1/P2)

- **P1-6 dedup:** route the `operations`/`acquisitionStreets` lane through the canonical `recKey` dedup; add address/street canonicalization to the key (uses Stage-2 canonicalization).
- **P2-1 graph exposure:** product decision — hide from customer nav, or label **beta**, or provide a non-visual fallback. No "coming soon" inside a paid surface without an explicit decision.
- **P2-2 territory:** show an empty-state ("אין נתוני נתח שוק לאזור") instead of "0%".
- **Feature-readiness mechanism (Phase 10):** a per-module state `production | beta | internal | disabled | unavailable-no-data`; broken/empty modules must not read as available; disabled modules must not leave dead nav links; lack-of-data ≠ technical error.

---

## Autopilot dependency

Autopilot slice-1 (kernel rescue subscriber) is safe to enable in **observability only** (flag-gated). **Do not surface the customer-facing rescue queue (slice 2) until P1-1 lands** — un-normalized locality data would fragment rescue proposals by spelling.

---

## Definition of Done (per issue)

Changed files listed · DB changes listed · tests added + passing (command + output) · before/after evidence captured · remaining risks noted · rollback documented · manual UI verification screenshot. Local success ≠ production success — verify in production config where the fix is config/env-dependent (esp. P0-1).
