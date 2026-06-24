# ZONO — Neighborhood Geo Readiness (Phase 25.2)

**Date:** 2026-06-24

## Two neighborhood layers
1. **`israel_neighborhoods`** (national master) — already has real **`lat`/`lng`**
   centers + `locality_code`, `confidence_score`, `is_verified`. This is the source
   of truth for neighborhood centroids. **Ready.**
2. **`neighborhoods`** (per-org AI enrichment) — was name-only. Phase 25.2 added
   nullable `centroid_lat`, `centroid_lng`, `centroid_source`, `geocoded_at`,
   `geocode_provider`, `geocode_confidence`, plus `polygon_geojson` + `polygon_source`
   for the future polygon phase.

## Centroid readiness (this phase)
- Centroids can be filled two ways, both real (never invented):
  1. **Join** `neighborhoods` → `israel_neighborhoods` on (city, name) → copy real
     center (`centroid_source = 'israel_neighborhoods'`).
  2. **Geocode** the "neighborhood, city, ישראל" string via the server geocoder
     (admin → Geo Intelligence Center → "מרכזי שכונות"), storing confidence;
     low-confidence is flagged, not trusted.
- `localities` (`israel_localities`) already provide city centers — used by
  `market_area_snapshots` centroid cache + as a coarse fallback.

## Polygon readiness (future)
- `polygon_geojson` / `polygon_source` columns exist but stay **NULL** — no fake
  polygons are generated. Real polygons come in a later phase from an OSM/boundary
  import keyed to `locality_code`, with point-radius fallback from the centroids
  above.

## Status
| Layer | Centroid | Polygon |
|---|---|---|
| israel_neighborhoods | ✅ real | ❌ (future) |
| neighborhoods (org) | ⚙️ fill via join/geocode (columns ready) | ❌ (columns ready, future) |
| localities | ✅ real city centers | ❌ (future) |

**Bottom line:** neighborhood centroids are achievable now from real data; polygons
are deferred with schema in place. No fake centroids or polygons are created.
