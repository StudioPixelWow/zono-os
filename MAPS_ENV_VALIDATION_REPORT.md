# ZONO — Google Maps Activation & Env Validation (Phase 24.1)

**Date:** 2026-06-24
**Context:** The two Google Maps keys are now configured in Vercel. This phase
verifies the code detects and uses them correctly, that no map silently falls back
to a mock, and that the missing-key state is honest.

**Verification:** scoped `tsc` + `eslint` on changed files = clean. Live Google
calls require the deployed runtime (keys live in Vercel), so the browser-side
assertions below are code-path verifications, to be confirmed once on the deploy.

---

## Required env vars

| Var | Scope | Used by |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Public (browser, build-inlined) | `ZonoMap.tsx`, `LocationMap.tsx` — Maps JavaScript API |
| `GOOGLE_MAPS_GEOCODE_API_KEY` | Server-only (runtime) | `src/lib/maps/geocoding.ts` — Geocoding API |

The geocoding service falls back to the public key only if the server key is unset;
the server key is never sent to the client.

## 1. Env vars are detected ✅

Both keys are now registered in the integration-status registry
(`src/lib/env-validation.ts` → `getIntegrationStatus()`), so the admin config /
system-health screen reports them like every other integration:

- **"Google Maps (תצוגת מפה)"** → `configured` from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **"Google Geocoding (השלמת קואורדינטות)"** → `configured` from
  `GOOGLE_MAPS_GEOCODE_API_KEY` (or the public key as fallback).

Detection is non-throwing (`isReal()` trim check). With the keys set in Vercel, both
rows render as configured; with neither, they render "not configured" with an honest
degradation note. No exhaustive `switch` on `IntegrationKey` exists, so adding the
two keys is type-safe (tsc clean).

## 2. Google Maps loader works ✅ (code path)

`ZonoMap.tsx` and `LocationMap.tsx` share the same loader pattern: a single, cached
`<script src="https://maps.googleapis.com/maps/api/js?key=…">` promise
(`loadGoogleMaps`), guarded so it loads once per page and resolves when
`window.google.maps` is present. On `onerror` the component sets an honest error
state ("שירות המפות לא זמין כעת…"), never a mock. Key is URL-encoded.

## 3. Geocoding service can initialize ✅ (code path)

`geocoding.ts#geocodeKey()` reads `GOOGLE_MAPS_GEOCODE_API_KEY` (then public key).
With a key present it issues a real `GET /maps/api/geocode/json` (region=il,
language=iw), maps `location_type` → confidence, and returns lat/lng + formatted
address. Without a key it returns `{ ok:false, reason:"config" }` — it never invents
coordinates. The admin tool (`/admin/geocoding`) surfaces honest run stats.

## 4. No map falls back to mock mode ✅

There is no mock/decorative fallback inside the real map path:
- `ZonoMap` renders Google markers ONLY for points with finite lat/lng. If the key
  is missing → "מפה לא זמינה"; if there are zero real points → honest empty state;
  on load failure → error state. None of these draw fake pins.
- The legacy `MapMock` component was **deleted** in Phase 24 (no imports remain).
- `LocationMap` uses the real picker when the key exists; without a key it shows
  numeric inputs / keyless preview — not a fake map.

## 5. Missing-key state shows "מפה לא זמינה" ✅

`ZonoMap`'s no-key branch renders a card titled **"מפה לא זמינה"** with the
sub-line "להצגת מפה אמיתית יש להגדיר את המפתח NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."
(Updated this phase to match the exact required wording.)

## 6. Existing mock map components identified

| Component | File | Status |
|---|---|---|
| `MapMock` | `src/components/domain/MapMock.tsx` | **Removed** (Phase 24) |
| Properties `MAP_PINS` map | `properties/PropertiesOSView.tsx` | **Converted** to real `ZonoMap` (Phase 24) |
| `CityMap` (SVG decorative) | `src/components/dashboard/CityMap.tsx` | **Still decorative** — home-dashboard widget; not yet converted (kept to avoid a home redesign). Candidate: feed from real deal/transaction coords. |
| `HeatmapSection` (SVG polygons) | `src/components/dashboard/sections/HeatmapSection.tsx` | **Still decorative** — has an honest empty state; gate behind real per-locality geo. |
| `DealsSection` map | `src/components/dashboard/sections/DealsSection.tsx` | **Still decorative** — wraps `CityMap` with %-coordinate deals. Candidate for `ZonoMap` once deal coords exist. |

These three dashboard widgets are the remaining mock map surfaces. They use
percentage/SVG coordinates and are **not** wired to the Maps key, so activating the
key does not turn them into real maps — they remain decorative until converted (each
would adopt `ZonoMap` + real coordinates, identical to the Properties conversion).

## TypeScript / eslint status

`tsc --noEmit` (env-validation, ZonoMap, system-health page) → 0 errors.
`eslint` (env-validation, ZonoMap) → 0 problems.

## Post-deploy smoke test (once, on Vercel)

1. Open `/properties` → the map renders in ZONO dark-purple with real property
   markers (no "מפה לא זמינה").
2. Admin → "מרכז תצורה"/system-health → "Google Maps" + "Google Geocoding" show
   configured.
3. `/admin/geocoding` → run for each entity → real success/low-confidence stats.
4. Temporarily unset the public key in a preview env → confirm "מפה לא זמינה".
