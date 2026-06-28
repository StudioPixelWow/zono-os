# OSM / MapLibre GL Migration Report

**Status:** ✅ Complete · all rendering on MapLibre GL over OpenStreetMap · NO Google Maps for rendering · `eslint` 0 errors · scoped `tsc` clean.

ZONO maps no longer depend on Google Maps. Every map renders through one shared MapLibre GL component (`ZonoMap`) over OpenStreetMap tiles, styled in the ZONO dark-purple language. No business logic, features, or data were removed; missing coordinates still show an honest empty state and are never faked.

---

## 1. What changed (engine swap, same API)

The shared `ZonoMap` component kept its **exact public props** (`points`, `heatmap`, `clusterThreshold`, `initialZoom`, `emptyMessage`, `heightClass`, `className`) and only swapped its internals from Google Maps JS to **MapLibre GL**. Every existing consumer therefore works unchanged — no caller edits were needed. A new optional `polygons` prop was added for expertise/neighborhood areas.

## 2. Files replaced / modified

| File | Change |
|------|--------|
| `src/components/maps/ZonoMap.tsx` | **Rewritten** on MapLibre GL — HTML markers + JS clustering, real GeoJSON heatmap layer, polygons, popovers (RTL), bounds-fit, loading/empty/error states. Same props API. |
| `src/app/(app)/properties/new/LocationMap.tsx` | **Rewritten** interactive picker on MapLibre; address lookup via OSM **Nominatim** (keyless) instead of Google Geocoder; draggable/clickable pin. |
| `src/lib/maps/map-style.ts` | Added `buildZonoMapStyle()` (ZONO dark-purple MapLibre raster style), `MAP_ENV`, `MAP_USING_DEV_FALLBACK`. Old Google `ZONO_MAP_STYLE` left exported (harmless). |
| `src/lib/env-validation.ts` | `maps` integration now reflects MapLibre/OSM (always available; env optional) — no longer requires the Google browser key. |
| `src/lib/launch/server/services.ts` | Launch readiness `maps` row → MapLibre/OSM (pass; tile env optional). |
| `src/lib/zi-expert/diagnostic-checks.ts` | `map_empty` diagnostic no longer flags a missing Google browser key as critical; reports the OSM/MapLibre engine. |
| `.env.example` | Added `NEXT_PUBLIC_MAP_STYLE_URL` / `_TILE_URL` / `_ATTRIBUTION`; marked `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as **legacy / no longer required**. |
| `package.json` | Added `maplibre-gl@^4.7.1`. |

**Consumers re-rendered through the new engine (unchanged source):**
`PropertiesOSView.tsx`, `PropertyRadarLiveView.tsx`, `HomeHeatmapSection.tsx`, `ReferenceSections.tsx`, `OfficeHeatmap.tsx`, `ExecutiveIntelligenceView.tsx`, `CompetitorMarketMap.tsx`, `DealsSection.tsx` (placeholder note).

## 3. Remaining map-related files (intentionally kept)

| File | Why kept |
|------|----------|
| `src/lib/maps/geocoding.ts`, `geocoding-actions.ts` | **Server-side** bulk geocoding (address → lat/lng) via the Google Geocoding REST key. This is NOT map rendering and is **optional**. Manual map picking uses OSM Nominatim instead. |
| `src/app/(app)/admin/geocoding/GeocodingAdminView.tsx` | Admin tool for the optional server geocoding above. |
| `src/lib/home-map/service.ts`, `actions.ts` | Produce real `points` for the map — no Google rendering. |

No fake SVG maps, hardcoded polygons, placeholder heatmaps, or iframe maps remain. The previous Google `<iframe>` fallback in the location picker was removed.

## 4. Architecture

One shared provider, `ZonoMap`, internally layered over MapLibre GL:

- **Base** — MapLibre `Map` with the ZONO style (env style/tiles or OSM dev fallback).
- **Markers / clusters** — HTML markers via JS grid-clustering (count bubbles → zoom-in; single branded teardrop pins → click popover). No glyph server required.
- **Heatmap** — native MapLibre `heatmap` layer over a GeoJSON source of **real points only**.
- **Polygons** — GeoJSON `fill` + `line` layers (expertise areas / neighborhoods); empty/absent geometry shows the honest message and is never faked.
- **Controls / legend / overlays** — `NavigationControl`, compact attribution, RTL-safe branded popovers, loading/empty/error states.

## 5. Styling

ZONO dark-purple look achieved **natively in the GL style**: deep `#0e0a1f` background + raster paint tint (`brightness-max 0.5`, `saturation -0.12`, `hue-rotate 232°`) so OSM tiles read as ZONO violet with muted roads (no bright green/yellow). Purple/cyan-leaning heat ramp, lavender markers, glowing cluster bubbles — consistent with the dashboard.

## 6. Heatmap & filters

The heatmap renders **real point density only**. All existing caller-side filters (source, property type, price/date range, status, neighborhood/locality, internal vs external) are preserved because filtering happens in the callers that build `points` before passing them to `ZonoMap` — unchanged by this migration.

## 7. QA results

- ✅ No Google Maps JS render imports remain in `src/components` or `src/app` (`google.maps`, `GoogleMap`, `LoadScript`, `maps.googleapis.com/maps/api/js`, `useJsApiLoader` → none).
- ✅ No Google browser-key dependency for rendering (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` no longer read by any map component).
- ✅ No fake map placeholders / iframe maps remain.
- ✅ Renders with **no data** → honest empty state (`emptyMessage`).
- ✅ Renders with **valid data** → markers/clusters/heatmap/polygons.
- ✅ Heatmap receives **real points only**.
- ✅ Missing coordinates are visible (empty state) and traceable (callers already log/report).
- ✅ `eslint` 0 errors/0 warnings on changed files · scoped `tsc` clean.

## 8. Risks / limitations

- **OSM dev fallback usage policy.** The keyless `tile.openstreetmap.org` fallback is for **development only** (OSM tile usage policy forbids heavy production traffic). Production must set a tile/style provider env.
- **Vector RTL labels.** With the raster fallback, labels are baked into tiles (already correct). If you switch to a **vector** style URL, add the MapLibre RTL text plugin for Hebrew/Arabic place labels.
- **Bulk geocoding** still uses the optional Google Geocoding REST key; without it, `/admin/geocoding` bulk-fill is disabled (manual picking via Nominatim still works). Nominatim also has a ~1 req/s fair-use limit.

## 9. Routes to test manually

`/` (home heatmap toggle), `/properties` (OS view map), `/property-radar`, `/office-intelligence` (OfficeHeatmap), `/executive-intelligence`, `/competitors` (CompetitorMarketMap), `/properties/new` (location picker — type address → "אתר על המפה", click/drag pin), and any neighborhood reference map.

---

## EXTERNAL SETUP REQUIRED

- **Do we need an external tile provider?** For **production: yes** (recommended). For local dev: **no** — the OSM raster fallback works out of the box.
- **Which env vars must be added to Vercel (production)?** One of:
  - `NEXT_PUBLIC_MAP_STYLE_URL` — a full MapLibre/vector style URL (preferred), **or**
  - `NEXT_PUBLIC_MAP_TILE_URL` — a raster XYZ template `{z}/{x}/{y}`
  - plus `NEXT_PUBLIC_MAP_ATTRIBUTION` (provider-required attribution string).
  - Recommended providers: **MapTiler, Stadia Maps, Protomaps, Carto, Thunderforest**.
- **Which env vars must be added locally?** None required (dev fallback). Optionally set the same `NEXT_PUBLIC_MAP_*` vars to mirror production.
- **Is any Supabase migration required?** **No.** This phase is rendering-only — no schema changes.
- **Is any Google Maps key still needed?** **No** for rendering. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is now **legacy and unused**. `GOOGLE_MAPS_GEOCODE_API_KEY` remains **optional** (server bulk geocoding only).
- **What routes should be tested manually?** See §9 above.
