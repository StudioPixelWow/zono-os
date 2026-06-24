# ZONO — Geo Data Expansion Engine (Phase 25.2)

**Date:** 2026-06-24
**Goal:** Make every map-capable entity geo-capable — nullable coordinate columns +
geo-profile tables + an admin Geo Intelligence Center. **No fake coordinates, no
generated locations, no estimated points without confidence; every point is
traceable** (geocoder provider + confidence, or a real import).

**TypeScript:** scoped `tsc --noEmit` (geo-coverage, admin page+view) → **0 errors.**
**ESLint:** same set → **0 problems.**
**Migration:** `20260733120000_geo_expansion.sql` (additive + idempotent). Validated
by review (no Postgres in this sandbox).

## 1. Tables audited
properties · external_listings · property_transactions · buyers · sellers ·
recommendations · territories (territory_profiles) · market_area_snapshots ·
israel_localities · israel_neighborhoods · neighborhoods (AI enrichment).

## 2. Columns / tables added (this phase)
- `neighborhoods`: `centroid_lat`, `centroid_lng`, `geocoded_at`, `geocode_provider`,
  `geocode_confidence`.
- `market_area_snapshots`: `centroid_lat`, `centroid_lng` (locality-center cache,
  filled from the `israel_localities` join — not invented).
- **`buyer_geo_profiles`** (new): preferred_cities, preferred_neighborhoods,
  search_radius_m, centroid_lat/lng, coverage_polygon, heat_score, geocode meta.
- **`seller_geo_profiles`** (new): property_count, centroid_lat/lng,
  exposure_radius_m, cluster, geocode meta.
- **`territory_centroids`** (new): territory_id, name, centroid_lat/lng,
  coverage_radius_m, polygon, source, confidence.
- All RLS + org-isolated; updated_at triggers; "missing-coords" partial indexes.

Already geo-capable (Phase 24, unchanged): `properties` (latitude/longitude+meta),
`property_transactions` (lat/lng+meta), `external_listings` (lat/lng+meta),
`israel_localities` (latitude/longitude), `israel_neighborhoods` (lat/lng).

## 3. Geo coverage %
Real, live, per entity — surfaced in the **Geo Intelligence Center** (`/admin/geocoding`)
via `getGeoCoverage()`: each entity shows `located/total` + `% located` + `missing`,
counted with `count: exact` (no estimates). Run there for current numbers
(environment has no DB access to print them here).

## 4. Missing geo data (filled by the real pipeline, never invented)
- external_listings + Madlan transactions: address only → **needs geocoding**.
- sellers: via linked property coords or geocode of address (no seller lat/lng yet).
- buyers: structured location lives in `buyer_geo_profiles` (centroid from geocoding
  preferred areas) — empty until populated.
- territories/neighborhoods (`neighborhoods` table): centroids empty until linked to
  `israel_neighborhoods` centers or geocoded.

## 5. Neighborhood readiness
**Strong.** `israel_neighborhoods` already has real `lat/lng` centers; the AI
`neighborhoods` table now has `centroid_lat/lng` columns to backfill from it. Polygon
support is future (Phase 25.3 / OSM).

## 6. Territory readiness
**Improved → table-ready.** `territory_centroids` lets a territory anchor to a real
neighborhood/locality center (source-tagged) with optional polygon. Population
(joining territory_profiles.neighborhood_name → israel_neighborhoods) is the next
step; no centroids are invented.

## 7. Buyer map readiness
**Schema-ready (aggregate).** `buyer_geo_profiles` stores preferred cities/
neighborhoods + radius + a geocoded centroid + heat_score → enables a future buyer
**demand** map/heat. Precise per-buyer points still depend on geocoding their
preferred areas.

## 8. Seller map readiness
**Schema-ready (via property).** `seller_geo_profiles` holds the seller's property
centroid + exposure radius + ownership cluster, sourced from the seller's real
linked properties' coordinates — best path, no seller-specific geocode required.

## 9. Future map opportunities
Transactions heat (after geocoding Madlan rows), buyer-demand choropleth, seller
exposure circles, territory coverage + competition-overlap, and full polygon heat
once Phase 25.3 (OSM boundaries) lands. The transaction geocoding pipeline already
exists (`/admin/geocoding` → property_transactions via `geocodeBatch`).

## 10/11. TypeScript / ESLint
Both clean. The geo-profile tables aren't in the generated DB types yet, so the
coverage service uses safe `as never` table access (consistent with other new-table
repositories) — typecheck passes.

## Supabase
Apply `supabase/migrations/20260733120000_geo_expansion.sql` (additive, idempotent).
After applying, the Geo Intelligence Center shows live coverage and the geocode
runner fills coordinates — only real, provider-tagged, confidence-scored points.

## Rules honored
No fake coordinates · no generated locations · no estimated points without
confidence · everything traceable (provider + confidence, or real import/join).
