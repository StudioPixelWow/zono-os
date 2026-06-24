# ZONO — Real Geo Data Audit (Phase 25)

**Date:** 2026-06-24
**Type:** Audit + infrastructure assessment only. No UI built, no screens
redesigned, **no mock coordinates, no fake polygons, no generated geo data**.

**Important — coverage numbers:** this environment has no access to the production
database, so row-level coverage **percentages are not invented here**. Every
"coverage" item below is reported as (a) the **schema capability** (verified from
`src/lib/supabase/types.ts` + migrations — these ARE actual findings) and (b) a
ready-to-run SQL query to compute the real % against live data. Numbers are
explicitly marked `RUN QUERY` rather than guessed, per the no-assumptions rule.

**TypeScript / ESLint status:** this phase changes **no code** (audit only). The
maps modules added in Phase 24/24.1 (`ZonoMap`, `geocoding`, `map-style`,
`geocoding-actions`, `env-validation`) last passed scoped `tsc --noEmit` = 0 errors
and `eslint` = 0 problems. No migration is required for the audit itself; migration
requirements for the follow-on phases are listed per phase in the roadmap.

---

## 0. The geo backbone (key finding)

ZONO already has a **real geographic reference layer** — these are point-coordinate
masters, not mocks:

| Table | Geo columns | Granularity |
|---|---|---|
| `israel_localities` | `latitude`, `longitude`, `district`, `subdistrict`, `population` | **City/locality centers** (national CBS-style master) |
| `israel_neighborhoods` | `lat`, `lng`, `locality_code`, `confidence_score`, `is_verified` | **Neighborhood centers** (point centroids) |
| `geo_coverage_targets` | `lat`, `lng`, `radius_meters`, `locality_id`, `neighborhood_name` | Coverage targets w/ point + radius |

**No polygons exist anywhere** in the schema — only point coordinates. The separate
`neighborhoods` table (AI-enrichment) is **name-only** (no coords), distinct from
`israel_neighborhoods` (which has coords).

---

## 1. Every geo-capable table (schema inventory)

| Table | address | city | locality | neighborhood | street | house no. | coordinates | polygon | Geocoding readiness |
|---|---|---|---|---|---|---|---|---|---|
| `properties` | ✅ `formatted_address` | ✅ `city` | ➖ (via region) | ✅ `neighborhood` | ➖ | ➖ | ✅ `latitude`/`longitude` (+geocode meta) | ❌ | **READY / NEEDS_GEOCODING** |
| `property_transactions` | ✅ `address`,`normalized_address` | ✅ `city_name` | ➖ | ✅ `neighborhood_name` | ✅ `street` | ✅ `street_number` | ✅ `lat`/`lng` (provider-mapped, GovMap only) | ❌ | **NEEDS_GEOCODING (partial real)** |
| `external_listings` | ✅ `address` | ✅ `city` | ✅ `locality_id` | ✅ `neighborhood` | ✅ `street` | ✅ `street_number` | ⚠️ `lat`/`lng` columns exist (Phase 24) but importer does **not** populate them | ❌ | **NEEDS_GEOCODING** |
| `sellers` | ✅ `address` | ✅ `city` | ✅ `locality_id` | ➖ | ➖ | ➖ | ❌ | ❌ | **NEEDS_GEOCODING / via property** |
| `buyers` | ❌ | ❌ (only `preferred_regions` enum) | ➖ | ➖ (only `preferred_areas` text[]) | ❌ | ❌ | ❌ | ❌ | **INSUFFICIENT_DATA (point); region-aggregable** |
| `leads` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **INSUFFICIENT_DATA** |
| `deals` / `deal_profiles` | ➖ (via property) | ➖ | ➖ | ➖ | ➖ | ➖ | ❌ | ❌ | **via linked property** |
| `opportunities` / `opportunity_signals` | ❌ | ➖ | ➖ | ➖ | ❌ | ❌ | ❌ | ❌ | **via linked entity** |
| `market_area_snapshots` | ❌ | ➖ | ✅ `locality_id`,`locality_name` | ❌ | ❌ | ❌ | ➖ (join `israel_localities`) | ❌ | **READY via locality join** |
| `territories` (`territory_profiles`) | ❌ | ➖ | ➖ | ✅ `neighborhood_name` | ✅ `street` | ❌ | ❌ | ❌ | **NEEDS_GEOCODING / join** |
| `recommendations` | ❌ | ➖ | ➖ | ➖ | ❌ | ❌ | ❌ | ❌ | **via map-points view** |
| `recommendation_map_points` (view) | ❌ | ➖ | ➖ | ✅ `neighborhood_name` | ✅ `street` | ❌ | ✅ `lat`/`lng` (nullable; from neighborhood join) | ❌ | **READY when neighborhood matched** |
| `activity_events` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **via related entity** |
| `israel_localities` | ➖ | ✅ `name_he` | ✅ `locality_code` | ➖ | ➖ | ➖ | ✅ `latitude`/`longitude` | ❌ | **READY** |
| `israel_neighborhoods` | ➖ | ✅ `city_name` | ✅ `locality_code` | ✅ `name_he` | ➖ | ➖ | ✅ `lat`/`lng` | ❌ | **READY** |
| `geo_coverage_targets` | ➖ | ✅ | ✅ `locality_id` | ✅ `neighborhood_name` | ➖ | ➖ | ✅ `lat`/`lng`+`radius_meters` | ❌ | **READY** |

Legend: ✅ present · ⚠️ column exists but unpopulated · ➖ derivable via join/relation · ❌ absent.

### External providers
| Provider | Used for | Returns coordinates? | Address fields | Geocoding required? |
|---|---|---|---|---|
| **GovMap** (`transactions/providers.ts`) | `property_transactions` | ✅ maps `lat/lng/x/y` from raw → persisted | full | Only when actor omits coords |
| **Madlan (transactions)** (`transactions/madlan.ts`) | `property_transactions` | ❌ no lat/lng mapping in normalizer | address/street/city | **Yes** |
| **Yad2 / Madlan (listings)** (`external-listings/providers.ts`) | `external_listings` | ❌ no coordinate mapping at all | address/street/city/neighborhood | **Yes** |

---

## 2. Current geo coverage — run these to get real %

No numbers are fabricated. Run in Supabase SQL editor (scope to your org as needed):

```sql
-- PROPERTIES geo coverage
select count(*) total,
       count(*) filter (where city is not null)              with_city,
       count(*) filter (where formatted_address is not null) with_address,
       count(*) filter (where neighborhood is not null)      with_neighborhood,
       count(*) filter (where latitude is not null and longitude is not null) with_coords,
       round(100.0*count(*) filter (where latitude is not null)/nullif(count(*),0),1) pct_coords
from public.properties;

-- TRANSACTIONS geo coverage
select count(*) total,
       count(*) filter (where address is not null) with_address,
       count(*) filter (where lat is not null and lng is not null) with_coords,
       round(100.0*count(*) filter (where lat is not null)/nullif(count(*),0),1) pct_coords
from public.property_transactions;

-- EXTERNAL LISTINGS geo coverage (by source)
select source_type,
       count(*) total,
       count(*) filter (where address is not null) with_address,
       count(*) filter (where lat is not null and lng is not null) with_coords
from public.external_listings group by source_type;

-- LOCALITIES / NEIGHBORHOODS masters
select count(*) localities, count(*) filter (where latitude is not null) with_center
from public.israel_localities;
select count(*) neighborhoods, count(*) filter (where lat is not null) with_center,
       count(distinct city_name) cities
from public.israel_neighborhoods;
```

## 3. Missing geo fields (by table)

- `external_listings`: coordinates not populated (importer ignores them) → geocode.
- `sellers`: no `latitude`/`longitude` → geocode from address, or inherit from linked
  `property_sellers` → `properties` coords.
- `buyers`: no structured city/neighborhood/coords/`search_radius` — only enum
  `preferred_regions` + free-text `preferred_areas`. To map buyers as **demand
  points/areas** would need either structured `preferred_locality_ids` (FK to
  `israel_localities`) or a `search_radius_m`.
- `territories`: no coordinates/polygon — only `neighborhood_name`/`street` text.
- `neighborhoods` (enrichment): no coords/polygon (use `israel_neighborhoods` instead).
- **All tables: no polygon column anywhere.**

## 4. Geocoding requirements — per-entity classification

| Entity | Class | Why |
|---|---|---|
| `properties` | **READY / NEEDS_GEOCODING** | has coords + full address; geocode only rows where lat/lng null (Phase 24 admin tool already does this) |
| `property_transactions` (GovMap) | **READY (partial)** | provider maps real lat/lng when present |
| `property_transactions` (Madlan) | **NEEDS_GEOCODING** | address present, no coords |
| `external_listings` | **NEEDS_GEOCODING** | rich address, no coords populated |
| `sellers` | **NEEDS_GEOCODING / VIA_PROPERTY** | address present; prefer property coords |
| `market_area_snapshots` | **READY (join)** | `locality_id` → `israel_localities` center |
| `recommendations` / map-points | **READY (join)** | neighborhood → `israel_neighborhoods` center |
| `territories` | **NEEDS_GEOCODING / JOIN** | neighborhood name → `israel_neighborhoods` |
| `buyers` | **INSUFFICIENT_DATA** | no structured location to geocode |
| `leads`, `activity_events`, `deals`, `opportunities` | **VIA_RELATION** | inherit from linked property/entity |

`src/lib/maps/geocoding.ts` **already exists** (Phase 24) and satisfies most of the
proposed architecture. Proposed completeness for the geocoding infra phase:
- **Provider abstraction** ✅ (currently Google; interface allows adding Nominatim/Mapbox).
- **Batch geocoding** ✅ `geocodeBatch()` with persist callback + delay.
- **Confidence scoring** ✅ `location_type` → 0..1.
- **Caching** ➕ TODO: persist results (done via DB columns) + a normalized-address
  cache table to avoid re-geocoding identical addresses across entities.
- **Retry handling** ➕ TODO: exponential backoff on `OVER_QUERY_LIMIT`/network; the
  current version fails closed (honest) but does not retry.

## 5. Polygon requirements

No polygons exist. Required for true heatmaps/territory shading rather than
point+radius. Provider comparison for **Israel** boundaries (city + neighborhood):

| Option | Coverage (IL) | Cost | Accuracy | Maintenance |
|---|---|---|---|---|
| **Google Boundaries / data-driven styling** | Country + admin levels; **neighborhood polygons limited in IL** | Paid (per map load / feature) | High for admin levels | Low (hosted) but vendor-locked |
| **Mapbox Boundaries** | Admin + some statistical areas | Paid tileset subscription | High | Low (hosted) |
| **OpenStreetMap (Nominatim / Overpass / boundaries extract)** | Good IL city boundaries; **neighborhood coverage uneven but best free option** | Free (self-host import) | Medium–High, varies | Higher (one-time import + periodic refresh into a `geo_polygons` table) |

**Recommendation: OpenStreetMap**, imported once into an internal `geo_polygons`
table (GeoJSON), keyed to `israel_localities.locality_code` / city name, with a
**point-radius fallback** from `israel_localities`/`israel_neighborhoods` centers
where a polygon is missing. Rationale: free, no per-load cost (matches "no vendor
lock + premium SaaS" posture), and ZONO already has the locality/neighborhood
centers to fall back on. Revisit Google/Mapbox only if pixel-perfect official
boundaries become a product requirement.

## 6. Territory readiness — Score: **4/10 (PARTIAL)**

- Have: `territory_profiles` with `neighborhood_name`/`street`, linked metrics/DNA,
  and a real neighborhood master (`israel_neighborhoods`) with centers.
- Missing: no coordinates/polygon on territories; no FK from territory → locality/
  neighborhood id (text-name join only); no polygon source.
- Verdict: territories can become **point/radius geographic territories** quickly by
  joining `neighborhood_name` → `israel_neighborhoods(lat,lng)`. **True polygon
  territories require the polygon phase.**

## 7. Buyer map readiness — **LOW / aggregate-only**

- Have: `preferred_regions` (enum), `preferred_areas` (text[]).
- Missing: structured locality/neighborhood ids, coordinates, search radius.
- Verdict: buyers **cannot be plotted as precise points** today. They CAN be shown
  as **demand by region/area** (choropleth/aggregate) once `preferred_areas` is
  reconciled to `israel_localities`/`israel_neighborhoods`. Recommend adding
  `preferred_locality_ids uuid[]` + optional `search_radius_m` in Phase 25.6.

## 8. Seller map readiness — **MEDIUM (via property)**

- Have: `address`, `city`, `locality_id`; sellers link to properties via
  `property_sellers`.
- Missing: seller-level coordinates.
- Verdict: sellers are **mappable through their linked property's coordinates**
  today (best path), or by geocoding the seller address. No seller-specific schema
  change strictly required if we map via property.

## 9. Heatmap readiness — **PARTIAL (locality-level YES, street-level NO)**

- **Inventory density:** ✅ possible now — group `properties` with coords by locality.
- **Transaction density:** ✅ for GovMap rows with `lat/lng`; ⚠️ Madlan rows need
  geocoding. Locality-level density is available via `city_name`.
- **Demand density:** ⚠️ from `buyers` only at region/area level (no points).
- **Geographic coverage:** ✅ `israel_localities`/`israel_neighborhoods` centers give
  a real point grid; **no polygons** so true filled heat shading needs point-radius
  or the polygon phase.
- **Insufficient for:** street/parcel-level heat (needs broad geocoding), and
  buyer-demand heat (needs structured buyer location). List of missing data:
  external-listing coords, Madlan transaction coords, structured buyer locations,
  polygons.

---

## 10. Recommended roadmap

**Phase 25.1 — Geo Data Cleanup.** Reconcile text city/neighborhood names to
`israel_localities`/`israel_neighborhoods` (add nullable FK ids on `properties`,
`external_listings`, `property_transactions`, `territory_profiles`). Normalize
Hebrew names. *Migration: additive FK columns + backfill script. Risk: LOW.*

**Phase 25.2 — Geocoding Infrastructure.** Finish `geocoding.ts`: add a
normalized-address **cache table**, retry/backoff, and wire the Phase 24 admin batch
tool to all NEEDS_GEOCODING entities (external_listings, Madlan transactions,
sellers). *Migration: `geocode_cache` table. Risk: LOW–MED (external API quota/cost).*

**Phase 25.3 — Polygon Infrastructure.** One-time OSM boundary import into a
`geo_polygons` table (GeoJSON) keyed to locality_code, with point-radius fallback.
*Migration: `geo_polygons` table (+ optional PostGIS `geometry`). Risk: MED
(import quality, optional PostGIS enablement).*

**Phase 25.4 — Territory Intelligence.** Turn `territory_profiles` into real
geographic territories using neighborhood centers (25.1 FK) + polygons (25.3),
scored from existing metrics. *Migration: territory↔polygon link. Risk: MED.*

**Phase 25.5 — Market Heat Engine.** Real heat from inventory + transaction density
per locality/neighborhood (point-radius now, polygons after 25.3). No decorative
zones. *Migration: optional `market_heat_cells` snapshot table. Risk: MED.*

**Phase 25.6 — Buyer/Seller Maps.** Sellers via linked-property coords (no schema
change); buyers via new structured `preferred_locality_ids` + `search_radius_m`
(demand choropleth). *Migration: buyer location columns. Risk: MED.*

---

## Migration requirements summary
- **This phase (25):** none (audit only).
- **25.1:** additive nullable FK id columns + backfill.
- **25.2:** `geocode_cache` table.
- **25.3:** `geo_polygons` table (consider PostGIS).
- **25.4–25.6:** small additive link/columns/snapshot tables as above.
All proposed migrations are additive and idempotent-friendly; none drop or rewrite
existing data.

## Implementation risk assessment
- **Cost/quota (MED):** broad geocoding of external listings + Madlan transactions
  consumes Google Geocoding quota — mitigate with the cache table and batch caps.
- **Name-matching (MED):** Hebrew city/neighborhood reconciliation is fuzzy; require
  a confidence threshold and leave low-confidence rows unlinked (never guess).
- **PostGIS (LOW–MED):** polygon work is simpler with PostGIS; if not enabled on the
  Supabase plan, store GeoJSON + do point-in-polygon app-side initially.
- **No-fabrication guarantee:** every phase above persists only real geocoded or
  imported coordinates; entities without resolvable location stay unmapped with an
  honest empty state (consistent with Phase 24).

## Rules honored
No mock coordinates · no fake polygons · no decorative heatmaps · no assumptions ·
no generated geo data · actual schema findings only (row-level % deferred to the
provided SQL).
