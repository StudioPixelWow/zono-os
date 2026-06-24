# ZONO — Buyer Demand Intelligence Engine

**Date:** 2026-06-24
**Goal:** turn ZONO from a *property*-intelligence system into a *demand*-intelligence
system — understand what buyers want, where, what inventory is missing, and where the
acquisition opportunities are: **"properties that should exist but currently do not."**

**Hard rule honored everywhere:** no fake demand, no generated buyers, no estimated
inventory. Every profile derives from a real `buyers` row; every gap count from real
`properties` rows; buyers with no usable area/type are skipped (we never guess where
someone wants to buy). **TypeScript: 0 errors · ESLint: 0 errors.**

## 1. New tables
Migration `supabase/migrations/20260736120000_buyer_demand_intelligence.sql`
(additive + idempotent, org-isolated RLS via `current_org_id()` + `has_min_role('agent')`):

- **`buyer_demand_profiles`** — demand fingerprint per real buyer (preferred cities/types,
  rooms, budget, urgency/financing/search-activity/engagement sub-scores, composite
  `demand_score` + band, `reasons`).
- **`demand_clusters`** — aggregated demand segments + the inventory gap (active/hot buyers,
  avg budget, urgency, `demand_strength` + band, real `inventory_count`, `gap_score` + band).
- **`demand_cluster_buyers`** — which real buyers belong to each cluster (`fit_score`, `is_hot`)
  → full traceability.
- **`acquisition_signals`** — shortage opportunities ("properties that should exist but don't").
- **`demand_heatmap_cells`** — aggregated demand by locality / area+type / property-type
  (data only, map-ready, **no coordinates fabricated**).

## 2. New scoring
**Per buyer (`buyer_demand_profiles`)** — all from real fields:
`urgency` (temperature + readiness), `financing_readiness` (pre-approval + readiness),
`search_activity` (last-contact recency), `engagement` (temperature + recency) →
composite **demand_score 0–100** → band `hot / strong / active / low`.

**Per cluster** — `demand_strength 0–100` from active-buyer count + hot ratio + avg urgency.

## 3. Demand clusters
Real buyers fan out across their **preferred areas × preferred types**, bucketed by
**rooms** (rounded) and **budget** (250K steps). A cluster needs **≥2 real buyers**
(no single-buyer "clusters", no invented members). Each cluster carries active buyers,
hot buyers, avg budget, urgency, demand strength + band, and a human label like
*"דירת 4 חדרים בקרית ביאליק עד 2.1M ₪"*.

## 4. Inventory gaps
For each cluster ZONO counts **real matching inventory** in `properties` (same city/
neighborhood, same type, rooms bucket, price ≤ ceiling×1.05, not sold/withdrawn/archived).
`gap_score = demand_strength·0.35 + scarcity·0.65`, where `scarcity = buyers/(inventory+1)`
(+25 when inventory = 0). Bands: `critical ≥80 · very_high ≥60 · high ≥40 · medium ≥20 ·
low`. Example surfaced as: **27 קונים / 4 נכסים → חוסר גבוה מאוד**.

## 5. Acquisition signals
Clusters with gap band `high+`, **≥3 real buyers**, and inventory ≤ buyers/2 become
`acquisition_signals` (e.g. *"מחסור חזק: דירת 5 חדרים בנוה גנים"*). Each carries strength,
buyers/hot/inventory counts, competition (buyers-per-available-property), and reasons —
these are the org's concrete acquisition opportunities.

## 6. Widgets created
- **Opportunity Center "מה חסר לי במלאי?"** — Top 10 demand gaps with no matching inventory
  (rank, gap band, buyers / hot / inventory / avg budget, "למה?" explainability).
- **`/demand` command center** — totals, Opportunity Center, acquisition-signal list (with
  dismiss), demand-cluster grid (strength + gap gauges), and the demand-heatmap data columns.
- **Nav** — `ביקוש קונים` added under מודיעין (`/demand`, icon Flame).

## 7. Explainability
Nothing is a black box. Every profile, cluster, gap and signal stores a `reasons` array
and the UI shows a **"למה?"** toggle that reveals: **buyers count · hot buyers · inventory
count · urgency · competition (buyers per available property)** — exactly the inputs that
produced the score.

## 8. Future map readiness
`demand_heatmap_cells` holds demand aggregated by **locality**, **area+type**, and
**property-type** with real buyer/inventory counts and strength — **data only, no fake map,
no invented coordinates**. A future geo layer joins these cells to the real
`israel_localities` / `israel_neighborhoods` centroids (already in the DB) to render an
honest demand heat map.

## 9. TypeScript status
Scoped `tsc --noEmit` over `src/lib/demand/**` + `src/app/(app)/demand/**` → **0 errors**.

## 10. ESLint status
ESLint over the same set → **0 errors, 0 warnings**.

---
### Files added
`src/lib/demand/types.ts`, `engine.ts` (pure), `service.ts` (server), `actions.ts`;
`src/app/(app)/demand/page.tsx` + `DemandCommandCenterView.tsx`; migration
`20260736120000_buyer_demand_intelligence.sql`; nav entry in `src/lib/navigation/registry.ts`.

### How to run
Apply the migration in Supabase, open **/demand**, press **"נתח ביקוש"** to compute the
demand graph from your real buyers + inventory. Re-run any time data changes.
