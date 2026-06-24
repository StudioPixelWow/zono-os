# ZONO — Geo Data Expansion Engine (Phase 25.2, full spec)

**Date:** 2026-06-24
**Goal:** Make every map-capable entity geo-ready — geo columns + geo-profile tables
+ status-aware server geocoding + an admin Geo Intelligence Center. **No fake
coordinates, no random lat/lng, no estimated points without confidence; every point
is traceable** (provider + confidence + status, or a real import/join). No new map UI.

**TypeScript:** scoped `tsc --noEmit` (geocoding, geocoding-actions, geo-coverage,
admin page+view) → **0 errors.** **ESLint:** same set → **0 problems.**

## 1. Tables audited
properties · external_listings · property_transactions · buyers · sellers ·
recommendations · territories · market_area_snapshots · localities · neighborhoods ·
deals · leads · activity_events. Full matrix in **GEO_DATA_AUDIT_REPORT.md**.

## 2. Tables modified
properties, external_listings, property_transactions (added `geocode_status`,
`geocode_error`); neighborhoods (centroid + polygon cols); market_area_snapshots
(centroid cache); buyer_geo_profiles, seller_geo_profiles, territory_centroids
(extra spec fields). New in prior 25.2: the three geo-profile tables.

## 3. Migrations created
- `20260733120000_geo_expansion.sql` — neighborhoods centroids + buyer/seller geo
  profiles + territory_centroids (RLS, triggers, indexes).
- `20260734120000_geo_expansion_v2.sql` — geocode_status/error, neighborhood polygon
  cols, the full-spec profile fields, status indexes.
Both additive + idempotent. (Phase 24's `20260731120000_geocode_columns.sql` already
gave properties/transactions/external_listings their lat/lng + base meta.)

## 4. Geo columns added
`latitude/longitude` (or lat/lng/centroid_lat/lng) · `formatted_address` ·
`geocode_provider` · `geocode_confidence` · `geocoded_at` · `geocode_status`
(pending|geocoded|low_confidence|failed|manual) · `geocode_error` · neighborhood
`centroid_source`, `polygon_geojson`, `polygon_source`.

## 5. New geo profile tables
- **buyer_geo_profiles** — preferred_localities/neighborhoods, search_radius_km,
  centroid_lat/lng, geo_confidence, metadata (future buyer demand maps).
- **seller_geo_profiles** — property_id, latitude/longitude, locality, neighborhood,
  geo_confidence, metadata (future seller/property opportunity maps).
- **territory_centroids** (serves as territory_geo_profiles) — territory_id,
  territory_type, centroid_lat/lng, coverage_radius_m, polygon_geojson, source,
  geo_confidence, metadata. *(Named territory_centroids from prior 25.2; extended to
  match the territory_geo_profiles spec — same capability, no duplicate table.)*

## 6. Geo coverage percentages
Computed live per entity by `getGeoCoverage()` (real `count: exact`): located/total +
% + missing + low-confidence + failed. Shown as cards in the Geo Intelligence Center.
(Environment has no DB access to print live numbers; run the admin screen.)

## 7. Geocoding actions added
`geocodeMissingAction(entity, limit, mode)` over properties / external_listings /
property_transactions / **neighborhoods centroids**, with `mode: 'missing' | 'failed'`
(retry). Writes lat/lng + status + provider + confidence; marks failures with the
error; flags low-confidence (<0.5) separately and **does not overwrite a higher-
confidence point with a worse one**. Server-only; the geocoding key is never exposed.

## 8. Admin tools added
**Geo Intelligence Center** (`/admin/geocoding`): coverage % cards (located/missing/
low-confidence/failed per entity) + per-entity **"גאוקד חוסרים"** and **"נסה שוב
כשלים"** actions, capped at 50 rows/run with gentle rate-limiting.

## 9. Remaining missing data
External-listing + Madlan-transaction coordinates (need a geocode run); buyer/seller
geo profiles + neighborhood/territory centroids are empty until populated (via join or
geocode). Polygons everywhere are deferred (Phase 25.3 / OSM). Nothing is invented.

## 10. What maps can now be built
Properties map (live), transactions map (after geocoding), external-listings map
(after geocoding), locality/neighborhood-center markers, and aggregate buyer-demand /
seller-exposure once profiles are filled.

## 11. What maps are still blocked
Filled polygon heat (no polygons yet), precise buyer-point maps (need structured
buyer location), street-level transaction heat (broad geocoding + quota).

## 12/13. TypeScript / ESLint
Both clean. New tables use safe `as never` access (not yet in generated types).

## Supabase
Run `20260733120000_geo_expansion.sql` then `20260734120000_geo_expansion_v2.sql`
(both additive + idempotent). After applying, the Geo Intelligence Center shows live
coverage and the geocode/retry actions fill only real, provider-tagged,
confidence-scored points.

## Acceptance
No fake/random coordinates · geo columns where needed · server-side pipeline · key
never exposed · admin sees coverage + can trigger geocoding/retry · low-confidence
not trusted · every point traceable · future real maps enabled · TS + ESLint pass.
