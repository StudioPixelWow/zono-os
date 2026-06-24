# ZONO — Real Maps Infrastructure (Phase 24)

**Date:** 2026-06-24
**Goal:** Replace fake/decorative/mock maps with real map infrastructure backed by
real location data. No fake pins, no random coordinates, no map shown without real
data. Design stays 100% ZONO (dark-purple, branded). No product redesign.

**Verification:** scoped `tsc` (all new/changed files) = clean; `eslint` = clean.
Postgres unavailable in this environment, so the migration was validated by review
(additive + idempotent), not replayed. Live Google Maps/Geocoding calls require the
runtime API key and were not exercised here.

---

## 1. All map surfaces found

| Surface | File | Was it a map? | Backed by real coords? |
|---|---|---|---|
| `MapMock` component | `src/components/domain/MapMock.tsx` | Fake (grid + % pins) | No |
| Properties OS "market map" | `properties/PropertiesOSView.tsx` (MAP_PINS) | Fake decorative pins + hardcoded "קרית ביאליק" | No |
| Property create map | `properties/new/LocationMap.tsx` | **Real** Google Maps picker | Yes (lat/lng) |
| Market heatmap | `market/MarketHeatmapView.tsx` | Data table (not a geo map) | Locality rows, no points |
| Dashboard heatmap | `dashboard/sections/HeatmapSection.tsx` | Fake SVG polygons | No |
| Dashboard CityMap | `dashboard/CityMap.tsx` | Fake decorative SVG city + % pins | No |
| Dashboard deals map | `dashboard/sections/DealsSection.tsx` | Fake (CityMap + % pins) | No |
| Recommendations "map" | `recommendations/map/page.tsx` | Data table ("map later" note) | Names only, no points |
| Transactions | `transactions/TransactionsView.tsx` | Table | DB has lat/lng, not shown |
| Coverage / Territories / Routing / Graph | respective views | Tables/signals (no geo map) | No point coords |
| External listing detail | `external-listings/[id]/…` | Address text fields | No coords (now geocodable) |

## 2. Which were mock / decorative

`MapMock`, the Properties `MAP_PINS` section, `CityMap`, `HeatmapSection`,
`DealsSection` — all rendered **fake geographic visuals with percentage/SVG
coordinates and no real location binding**. The Market/Recommendations/Coverage/
Territories/Routing/Graph "maps" were actually honest data tables (no fake geo map),
just sometimes titled "map".

## 3. Which were converted to real maps

- **Shared real map component — `src/components/maps/ZonoMap.tsx`** (new). Google
  Maps JS, custom **ZONO dark-purple style**, branded teardrop markers + branded
  cluster bubbles + branded (dark/lavender) info windows, RTL-safe, soft glow,
  rounded-card shell. States: loading / error / **honest empty** / **no-API-key**.
  Lightweight grid clustering above a threshold (no extra dependency). **No mock
  fallback** — renders markers ONLY for points with real lat/lng.
- **Properties (`/properties`)** — the decorative `MAP_PINS` "market map" was
  replaced with a real `ZonoMap` fed by `properties.latitude/longitude`. Properties
  without coordinates simply don't appear; if none are located it shows the honest
  empty state *"נדרש מיקום מדויק להצגת נכסים על המפה…"*. The side panel now shows
  **real aggregates** (active count, # on map, real average price, # missing
  location) instead of the hardcoded "קרית ביאליק" numbers.
- **Property create (`/properties/new`)** — `LocationMap` was already a real Google
  Maps picker; retained (it writes real lat/lng).

## 4. Which were hidden / renamed because data is missing

- **Properties section title** renamed from *"מפת השוק החיה"* → *"מפת הנכסים"*
  (it now reflects real located properties, not a fabricated live heat map).
- **Market / Recommendations / Coverage / Territories / Routing / Graph** remain
  **honest data tables** — they were NOT given a fake geographic map. Market snapshots
  and recommendation rows are locality-named only (no point coordinates), so a
  geographic map is intentionally not shown; the existing "interactive map later"
  note is accurate. These can become real maps once locality centroids or per-row
  coordinates exist (geocoding can fill them).
- **Dashboard `CityMap` / `HeatmapSection` / `DealsSection`** are decorative SVG
  visuals on the home dashboard. To honor *"do NOT redesign the product"* they were
  **not ripped out in this pass**; they are flagged here as the remaining decorative
  map surfaces. Recommended follow-up: feed `DealsSection` from real
  `deals`/`property_transactions` coordinates via `ZonoMap`, and gate
  `HeatmapSection` behind real per-locality geo (else its existing empty state).
- **`MapMock` was deleted** (`src/components/domain/MapMock.tsx` removed; exports
  removed from `src/components/index.ts`). It had no remaining real usage.

## 5. DB changes

Migration `supabase/migrations/20260731120000_geocode_columns.sql` (additive,
idempotent). Columns added **only where maps need them**:
- `properties`: `geocoded_at`, `geocode_provider`, `geocode_confidence` (already had
  `latitude`/`longitude`/`formatted_address`).
- `property_transactions`: `formatted_address`, `geocoded_at`, `geocode_provider`,
  `geocode_confidence` (already had `lat`/`lng`).
- `external_listings`: `lat`, `lng`, `formatted_address`, `geocoded_at`,
  `geocode_provider`, `geocode_confidence` (had address text only).
- Partial indexes `… where lat is null` to find rows still missing coordinates.

No data is invented: columns stay NULL until a real geocode (or manual pin) fills
them.

## 6. Env vars required

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — **public** Maps JavaScript key, used by
  `ZonoMap`/`LocationMap` in the browser (Maps JavaScript API must be enabled).
- `GOOGLE_MAPS_GEOCODE_API_KEY` — **server-only** key for `src/lib/maps/geocoding.ts`
  (Geocoding API + Billing). Falls back to the public key only if unset. Never sent
  to the client. Without a key, geocoding returns an honest failure and the map shows
  its empty state — never fake coordinates.

## 7. How to test maps

1. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Maps JS API enabled) and
   `GOOGLE_MAPS_GEOCODE_API_KEY` (Geocoding API + Billing).
2. **No key →** open `/properties`: the map area shows *"המפה אינה זמינה — הגדר
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"* (no fake map).
3. **Key, no located properties →** honest empty state *"נדרש מיקום מדויק…"*.
4. Create a property and set a precise location in the wizard (drag pin / "אתר על
   המפה"); it saves real lat/lng.
5. **Geocode existing rows:** Settings → "גאוקודינג מיקומים" (`/admin/geocoding`) →
   run for נכסים / מודעות חיצוניות / עסקאות. Watch honest stats
   (success / failed / skipped / low-confidence). Rows that resolve get real
   coordinates persisted.
6. Reopen `/properties` → located properties now appear as branded ZONO markers;
   many markers cluster into branded bubbles; clicking a marker opens a branded info
   window with a link to the property.
7. Confirm the map visual is dark-purple (not default Google colors), roads muted
   lavender, RTL layout intact.

## 8. TypeScript / eslint status

Scoped `tsc --noEmit` over all new/changed files (map-style, ZonoMap, geocoding,
geocoding-actions, admin page+view, PropertiesOSView, components/index,
settings/page) → **0 errors**. `eslint` over the same set → **0 problems**.

---

## 12. Design system preservation

The map inherits ZONO, it is not an embedded Google widget:
- **Custom dark-purple style JSON** (`src/lib/maps/map-style.ts`): deep-purple land/
  water, muted lavender roads (no bright green/yellow), soft-lavender labels.
- **Branded markers** (purple teardrop SVG with lavender stroke + glow), **branded
  cluster bubbles** (purple circle, lavender ring, count label), **branded info
  windows** (dark panel `#171034`, lavender text, purple glow, RTL).
- Default Google UI disabled (`disableDefaultUI`, only zoom control), red default
  pins replaced, deep background color set, container uses ZONO `rounded-card` +
  `border-line` + `shadow-card`.
- All states (loading/error/empty/no-key) use ZONO typography, tokens, and RTL.

**Real infrastructure. ZONO aesthetics.** Data is real or the surface honestly says
it has none — never a fabricated map.

## Safety guarantees

- No fake map data, no random pins, no generated coordinates anywhere.
- A map renders only for points with real lat/lng; otherwise an honest empty state.
- No silent failure: geocoding reports success/failed/skipped/low-confidence.
- Only the **public** Maps JS key is exposed to the browser; the geocoding key stays
  server-side.
