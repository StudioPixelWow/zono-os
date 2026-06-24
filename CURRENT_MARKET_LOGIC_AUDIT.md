# ZONO — Current Market Logic Audit (Phase 25.1, pre-change baseline)

**Date:** 2026-06-24
This documents what drove the Heatmap / Market Intelligence screen **before** the
25.1 engine upgrade, classifying each value as hardcoded / placeholder / simulated /
real.

## Components inspected

### HeatmapSection (`dashboard/sections/HeatmapSection.tsx`)
- **Before Phase 24.2:** fake SVG polygons positioned by hardcoded `points`/
  `labelX`/`labelY` (simulated geography) — though fed by real demand numbers.
- **After 24.2 (current baseline):** honest ranked panel (no map). It rendered
  `changePct = demand − supply` and `heatLabel`. **Real data, but the headline
  number was a demand−supply delta, not an explainable opportunity score.**

### CityMap (`dashboard/CityMap.tsx`)
- **Simulated.** Decorative SVG city with percentage pins. **Deleted in Phase 24.2.**

### Market widgets (`MarketSection`, `getMarketWidgets`)
- Real org-scoped counts (active listings, buyers, price stats). **Real.**

### Opportunity widgets / heat
- `market_area_snapshots.opportunity_score` + `heat_level` from `market/engine.ts`
  (`calculateOpportunityScore`, `calculateHeatLevel`). **Real & deterministic**, but
  used only demand/supply + a few listing flags — **no transactions, no momentum
  (trend over time), no competition dimension, and no per-score explainability.**

### Market scoring logic (`market/engine.ts` + `market/service.ts`)
- `calculateDemandScore` — **real** (active buyers, readiness, engagement, matches,
  relationship signals).
- `calculateSupplyScore` — **real** (listings, new listings, price drops, dupes,
  private owners).
- `calculateOpportunityScore` — **real** (demand−supply gap + below-average + drops
  + ready buyers + office-exclusive).
- `calculateHeatLevel` — **real** thresholds.

## Verdict table

| Value | Classification (baseline) |
|---|---|
| demand_score | **Real** (counted buyer signals) |
| supply_score | **Real** (counted listing signals) |
| opportunity_score | **Real** but narrow (no tx / momentum / competition) |
| heat_level / heatLabel | **Real** (threshold of the above) |
| HeatmapSection headline `%` | **Real number** (demand−supply) but **not an explainable opportunity score** |
| CityMap pins / positions | **Simulated** (deleted) |
| HeatmapSection SVG polygons | **Simulated geography** (removed 24.2) |
| transaction influence | **Missing** (property_transactions not used) |
| momentum / trend | **Missing** (no snapshot-over-snapshot comparison) |
| competition dimension | **Missing** |
| per-score explainability | **Missing** (no "why") |

## Gaps closed by Phase 25.1
- Added real **transaction_score** (from `property_transactions` 90d vs prior 90d).
- Added **momentum** (current snapshot vs most-recent prior snapshot: demand, price/m²,
  listings, transactions) with declining/stable/growing/accelerating classification.
- Added **competition_score** (agent-marketed listing density / saturation).
- Added explicit **inventory_score** (supply pressure inverted).
- Replaced the narrow opportunity with **opportunity v2** (weighted blend of all
  five) + **explainable band classification** + **reasons[]** per locality.
- No fake data introduced; every input remains a counted value.
