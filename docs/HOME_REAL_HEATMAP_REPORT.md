# ZONO — Home Real Heatmap (Phase 24.6)

Restored the prominent Home Dashboard property map as a **real**, ZONO-styled live
map of internal + external properties in the agent's operating area. No fake
SVG/grid/scatter, no percentage coordinates, no invented pins, no mock heat zones.

## 1. Files changed
- `src/lib/home-map/types.ts` — filters + data DTOs (client-safe).
- `src/lib/home-map/service.ts` — server-only data builder (real coordinates only).
- `src/lib/home-map/actions.ts` — `getHomeMapDataAction(filters)` (org-scoped).
- `src/components/dashboard-home/components/HomeHeatmapSection.tsx` — the large
  ZONO-purple map card + glass filter panel + empty states (client).
- `src/components/dashboard-home/DashboardHomeView.tsx` — inserted the section as
  section "4b", a full-width centerpiece right after the Opportunity Map. No other
  section changed; Home metrics untouched.

Reuses (unchanged): `src/components/maps/ZonoMap.tsx`, `src/lib/maps/map-style.ts`,
`src/lib/operating-areas/service.ts`.

## 2. Data sources (real only)
- **Internal** — `public.properties`: `org_id` scoped, only rows with real
  `latitude`/`longitude`. Fields used: title, city, neighborhood, price,
  monthly_rent, listing_kind, type, created_at. Links to `/properties/{id}`.
- **External** — `public.external_listings`: `org_id` scoped, `status='active'`,
  only rows with real `lat`/`lng`. Fields used: title, city, neighborhood, price,
  property_type, deal_type, source (Yad2/Madlan/…), has_agent, first_seen_at,
  listing_url. Links to the source `listing_url`.
- Rows without coordinates are **excluded** (never invented).

## 3. How operating area is resolved
Via `getMyOperatingAreas()` → active areas → unique `cityName`s. External listings
are scoped to those cities (`.in("city", cities)`), optionally narrowed to one city
via the locality filter. Internal properties are scoped to `org_id` (the office's
own inventory). If no operating area is defined and there is nothing to show, the
section renders the honest empty state: **"יש להגדיר אזור התמחות כדי להציג מפת חום"**
with a link to `/settings/operating-areas`.

## 4. Filters implemented
Sale/Rent · Internal/External (scope) · Source (Yad2/Madlan/Manual) · Property type
(דירה/בית/מסחרי/מגרש, mapped to the internal `property_type` enum + external
text tokens) · Price min/max · New (last 14 days) · Private owners (external
`has_agent = false`) · Locality (one of the operating-area cities). Each filter
re-queries via the action with a live "טוען…" indicator.

## 5. Heat / cluster logic
A real Google heatmap layer is not yet wired into ZonoMap, so per the brief the
section uses **clustered branded ZONO markers** (purple = internal, green =
external) and is labeled a live property map — **not** "heatmap" in the UI copy.
Clustering kicks in above 60 points (`ZonoMap clusterThreshold`). No fake heat
circles. (Future: a real density heat overlay can be added to ZonoMap and swapped
in without changing the data layer.)

## 6. Empty states
- No Google key → **"מפה לא זמינה"**.
- No operating area & nothing to show → **"יש להגדיר אזור התמחות כדי להציג מפת חום"** + CTA.
- No real-coordinate points → ZonoMap shows **"אין עדיין נכסים עם מיקום מדויק להצגה על המפה"**.
- No external listings → footer note **"נכסים חיצוניים יוצגו לאחר סנכרון מקורות כמו Yad2 / Madlan"**.

## 7. Remaining limitations
- True heat-density overlay not yet implemented (clustered markers used instead).
- External coordinates depend on the admin batch geocode of `external_listings`
  (rows stay off-map until `lat/lng` are filled — by design, never invented).
- Property-type filter on external listings is a best-effort text match (external
  `property_type` is free text); internal uses the exact enum.
- Internal scoping is org-wide (not per operating-area city) since office inventory
  isn't limited to monitored localities; the city filter still narrows both.

## 8. TypeScript status
Scoped `tsc --noEmit` over the new module + touched view: **0 errors**.

## 9. ESLint status
Scoped ESLint over all new/changed files: **0 problems**.
