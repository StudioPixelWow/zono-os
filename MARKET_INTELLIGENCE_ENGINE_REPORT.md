# ZONO — Real Market Intelligence Engine (Phase 25.1)

**Date:** 2026-06-24
**Goal:** Turn the Market Intelligence / Heatmap screen into a real intelligence
engine. UI, visual language, and ZONO styling unchanged — **only the intelligence
layer behind it was replaced/extended.** Every number is traceable to counted data;
no fake scores, no simulated opportunity values, no decorative heatmaps, no invented
percentages.

**TypeScript status:** scoped `tsc --noEmit` (engine, service, dashboard types,
HeatmapSection, RealContainers) → **0 errors.**
**ESLint status:** same set → **0 problems.**

## 1. Current scoring audit
See `CURRENT_MARKET_LOGIC_AUDIT.md`. Baseline demand/supply/opportunity were already
**real** but narrow: no transactions, no momentum, no competition, no explainability.
The HeatmapSection headline was a demand−supply delta, not an explainable score.

## 2. Available data sources (used by the engine)
| Source | Used for | Coverage | Freshness | Geo readiness | Scoring usefulness |
|---|---|---|---|---|---|
| Internal **properties** | inventory, internal supply, exclusivity | org-owned | live | city/locality match | High |
| Internal **buyers** (+ buyer_intelligence_profiles) | demand, readiness, ready-buyers | org-owned | live | preferred_areas → locality | High |
| **match_intelligence_profiles** | matched-buyer demand | derived | live | via property city | Med |
| **entity_relationships** | engagement (viewed/liked/visited) | derived | live | via property city | Med |
| **external_listings** (Yad2/Madlan) | supply, new listings, private vs agent (competition), below-average | scraped | per sync | city match (no coords) | High |
| **external_listing_history** | price drops (softening) | scraped | 14d window | — | Med |
| **property_transactions** (GovMap/Madlan) | transaction volume/velocity/trend | scraped, where available | per sync | city_name match | High (when present) |
| **market_area_snapshots** (history) | momentum (prior vs current) | org daily rows | daily | locality | High |
| **israel_localities** | locality registry | national | static | city centers | (geo only) |

## 3. Missing data (honest)
- **Transaction coordinates / completeness** vary by source (Madlan tx don't map
  lat/lng; some have no `deal_date`). Localities with zero real transactions get
  `transaction_score = 0` (never invented).
- **Momentum needs ≥2 daily snapshots**; the first run has no history →
  `momentum = 50 (stable)` with the honest reason "אין היסטוריה להשוואה עדיין".
- **Competition** uses listing agent-share as a proxy; explicit competing-agent
  rosters (broker_profiles) are not yet folded in (roadmap).
- **Buyer demand** depends on `preferred_areas` text matching localities.

## 4. Scoring formulas (all deterministic, in `src/lib/market/engine.ts`)
- **inventory_score** = 100 − min(45, listings×2) − min(20, newListings×4) − min(12, priceDrops×2). *(high inventory pressure → lower)*
- **demand_score** (unchanged, real): active buyers + readiness + engagement + matched + relationship signals.
- **transaction_score** = 0 if no real tx; else 12 + min(45, tx90×4) ± trend(tx90 vs txPrev90) + min(15, txTotal×0.5).
- **momentum** = 50 + demandΔ×0.6 + priceΔ%(±10) + txΔ(±15) − listingΔ×0.5 → class: ≥80 accelerating / ≥60 growing / ≥40 stable / <40 declining. No history → 50/stable.
- **competition_score** = 8 + min(60, agentListings×4) + min(25, totalListings×1.5). *(higher = more saturated)*
- **opportunity_score (v2)** = demand×0.30 + transaction×0.20 + max(0,(momentum−50)×2)×0.20 + inventory×0.15 + (100−competition)×0.15. All clamped 0–100.

### Heatmap classification (bands, explainable)
90–100 **יוצא דופן** · 75–89 **פוטנציאל גבוה** · 60–74 **במגמת צמיחה** ·
40–59 **ניטרלי** · 20–39 **חלש** · 0–19 **סיכון**.

### Explainability
`buildScoreReasons()` returns human reasons, each tied to a counted input, e.g.:
`פוטנציאל גבוה (84)` →
- `ביקוש 78/100 — 9 קונים פעילים, 4 בשלים`
- `מלאי 71/100 — 12 מודעות פעילות, 3 חדשות (7 ימים)`
- `עסקאות 66/100 — 14 ב-90 הימים האחרונים (+5 מול התקופה הקודמת)`
- `מומנטום במגמת עלייה (64/100) · מחיר/מ"ר +3.2%`
- `תחרות 38/100 — 5 מודעות מתוּוכות`

## 5. DB changes
**None required.** The four optional tables (`market_intelligence_profiles/signals/
scores/history`) were intentionally **not created** — the existing
`market_area_snapshots` already provides per-locality scoring, and its daily rows ARE
the history (momentum reads the most-recent prior row). The extended scores +
momentum class + band + `reasons[]` are persisted in the existing `metadata jsonb`
column. This keeps RLS/org-isolation (already on the table) and avoids schema churn.
*If a normalized scores/signals table is later wanted for cross-entity querying, it's
listed in the roadmap — not needed for the engine to be real now.*

## 6. Heatmap integration plan (done)
- `getCurrentMarketHeatmap()` now returns the extended cell: `inventoryScore`,
  `transactionScore`, `competitionScore`, `momentumScore`/`momentumClass`,
  `bandKey`/`bandLabel`, and `reasons[]` (read from snapshot + metadata).
- `HeatmapSectionContainer` maps cells → ranked panel using the real **opportunity
  score** + **band label** + top **reasons**; the AI insight line now states the top
  locality's band + score + first reason.
- `HeatmapSection` (existing UI, unchanged styling) shows `score/100`, the band
  label, and up to 3 explainability bullet reasons per locality. Tone now comes from
  the real opportunity **band** (falls back to heat tone for legacy rows).
- The headline `%` was replaced with a real `score/100` (no decorative percentage).

## 7. Implementation roadmap
- **25.1 (this phase) ✅** — extended engine (6 scores + momentum + bands + reasons),
  service wiring (transactions + momentum + competition), persisted in snapshot
  metadata, surfaced in the existing Heatmap UI.
- **25.1b** — fold `broker_profiles`/agent rosters into competition; schedule daily
  snapshot cron so momentum always has history.
- **25.2** — geocode transactions/listings (real points) → enable map-level heat.
- **25.3** — polygon infrastructure (OSM) for filled neighborhood heat.
- **25.4** — territory intelligence consumes the same locality scores.
- *(Optional)* normalized `market_intelligence_signals` table if cross-module
  querying of individual signals is needed.

## 8/9. TypeScript / ESLint
Both clean (0 errors / 0 problems) on all changed files. No migration to apply for
this phase — the snapshot table + `metadata` already exist, so **no Supabase SQL is
required**. Scores populate on the next "compute market snapshots" run.

## Rules honored
No fake scores · no simulated opportunity values · no decorative heatmaps · no
invented percentages · every number traceable to counted data (buyers, listings,
transactions, snapshot history).
