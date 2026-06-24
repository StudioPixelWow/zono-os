# ZONO — Geo Data Audit (Phase 25.2)

**Date:** 2026-06-24 · Schema-level audit of every geo-capable table. "Can be shown
on a map today" = has real lat/lng now (no invented points).

| Table | city/locality | neighborhood | address | street | house no. | lat/lng | formatted_addr | geocodable safely? | on a map today? |
|---|---|---|---|---|---|---|---|---|---|
| properties | ✅ city | ✅ | ✅ formatted_address | ➖ | ➖ | ✅ latitude/longitude | ✅ | ✅ | ✅ (rows with coords) |
| external_listings | ✅ city,locality_id | ✅ | ✅ | ✅ | ✅ street_number | ✅ lat/lng (importer doesn't fill) | ⚠️ (+meta) | ✅ | ⚠️ after geocode |
| property_transactions | ✅ city_name | ✅ neighborhood_name | ✅ address,normalized | ✅ | ✅ | ✅ lat/lng (GovMap fills; Madlan no) | ✅ (+meta) | ✅ | ⚠️ partial / after geocode |
| buyers | ➖ preferred_areas (text[]) | ➖ | ❌ | ❌ | ❌ | ❌ (→ buyer_geo_profiles) | ❌ | ⚠️ via geocoding preferred areas | ❌ (aggregate only) |
| sellers | ✅ city,locality_id | ➖ | ✅ address | ❌ | ❌ | ❌ (→ seller_geo_profiles / via property) | ⚠️ | ✅ via linked property | ❌ (until profile filled) |
| recommendations | ➖ city/neighborhood names | ➖ | ❌ | ❌ | ❌ | ❌ (map-points view has lat/lng from neighborhood join) | ❌ | ➖ via neighborhood centroid | ⚠️ when neighborhood matched |
| territories (territory_profiles) | ➖ | ✅ neighborhood_name | ❌ | ✅ street | ❌ | ❌ (→ territory_centroids) | ❌ | ✅ via neighborhood center | ❌ (card/table until centroid) |
| market_area_snapshots | ✅ locality_id/name | ❌ | ❌ | ❌ | ❌ | ➖ centroid via israel_localities join (+new cache cols) | ❌ | ✅ locality center | ✅ at locality level |
| localities (israel_localities) | ✅ | ➖ | ➖ | ➖ | ➖ | ✅ latitude/longitude | n/a | n/a | ✅ city centers |
| neighborhoods (AI enrichment) | ✅ city_name | ✅ neighborhood_name | ❌ | ❌ | ❌ | ✅ centroid_lat/lng (new, nullable) | ❌ | ✅ via israel_neighborhoods | ❌ until centroid filled |
| israel_neighborhoods | ✅ city_name | ✅ name_he | ❌ | ❌ | ❌ | ✅ lat/lng | n/a | n/a | ✅ neighborhood centers |
| deals / deal_profiles | ➖ via property | ➖ | ➖ | ➖ | ➖ | ❌ | ❌ | ➖ via linked property | ❌ (inherit from property) |
| leads | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (no geographic meaning) |
| activity_events | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (via related entity) |

Legend: ✅ present · ⚠️ exists but needs geocoding/partial · ➖ derivable via relation/join · ❌ absent.

**Conclusion:** Entities with a real location got geo columns (properties,
external_listings, transactions, neighborhoods centroids) + geo-profile tables
(buyers/sellers/territories). Abstract entities (leads, activity_events, deals)
were intentionally NOT given coordinates — they inherit from a linked property.
