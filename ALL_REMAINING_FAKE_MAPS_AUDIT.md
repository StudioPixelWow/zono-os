# ZONO — All Remaining Fake Maps, Eliminated (Phase 24.5)

**Date:** 2026-06-24
**Goal:** Find and remove every remaining fake / decorative / simulated map. After
this phase: no grid/scatter/SVG is labeled a map; no "מפת" title exists unless it
renders a real geographic map; no percentage-position pins or decorative heat zones
remain. Properties map stays the one real `ZonoMap`.

**TypeScript:** scoped `tsc --noEmit` on all changed files → **0 errors.**
**ESLint:** changed files → **0 problems.**

## 1–6. Map-like surface classification

| Route / Area | Component | Current visual | Data source | Real geo? | Class | Action taken |
|---|---|---|---|---|---|---|
| /properties | `PropertiesOSView` "מפת הנכסים" | **Real ZonoMap** | `properties.latitude/longitude` | ✅ | REAL_MAP | Kept (Phase 24) |
| /properties/new | `LocationMap` | Real Google map/iframe picker | entered lat/lng | ✅ | REAL_MAP | Kept |
| Home (dashboard-home) | `ReferenceSections` "מפת ההזדמנויות" | **Fake scatter** — bubbles at random top/left %, fake zoom/filters | heat-zone metrics (no geo) | ❌ | FAKE_MAP | **Converted** → ranked "תובנות אזוריות" cards (no positioning) |
| Home / dashboard | `HeatmapSection` | ranked panel (24.2) | `market_area_snapshots` | ❌ | NON_MAP_VISUALIZATION | Kept; renamed "מודיעין ביקוש שכונתי" |
| Home / dashboard | `DealsSection` | honest placeholder (24.2) | deals (no coords) | ❌ | NEEDS_GEO_DATA | Kept honest placeholder |
| Home hero | `HeroSection` | branded CTA to real map (24.2) | — | n/a | NON_MAP_VISUALIZATION | Kept |
| (legacy) | `CityMap` | decorative SVG city | mock pins | ❌ | REMOVE | **Deleted** (Phase 24.2) |
| (legacy) | `MapMock` | grid + % pins | mock | ❌ | REMOVE | **Deleted** (Phase 24) |
| /market | `MarketHeatmapView` "מפת ביקוש ומחירים" | cards/table (no geo) | snapshots | ❌ | NON_MAP_VISUALIZATION | **Renamed** → "מדדי ביקוש ומחירים"; button/empty-state de-mapped |
| /recommendations/map | `page` | table | rec points (names) | ❌ | NON_MAP_VISUALIZATION | h1 already "אזורי ביקוש"; body de-promised "map" |
| /territories, /routing, /competitors, /acquisition, /command, /sellers | section/table titles using "מפת…" | tables/cards | real rows (no geo) | ❌ | NON_MAP_VISUALIZATION | **Renamed** (see §7) |
| /transactions, /graph, /deals, /buyers, /sellers | tables/lists | — | real rows | ❌ | NON_MAP_VISUALIZATION | No map wording / no fake map |
| Nav (Sidebar / command-center / registry / mock) | "מפה חכמה" / "מפת ביקוש" / "מפת הזדמנויות" → /market | nav label | — | ❌ | REMOVE_OR_RENAME | **Renamed** → "מודיעין שוק" / "מדדי ביקוש" |

### Which were fake (visual) → fixed
- `ReferenceSections.OpportunityMapSection` — the only remaining **fake visual map**
  (percentage-positioned bubbles, grid background, fake zoom/filter chrome). Converted
  to a ranked **area-insights** card grid using the real metrics, no positioning,
  retitled **"תובנות אזוריות"**.

### Which were converted to real ZonoMap
- None new this phase — the only legitimately geo-backed surface (Properties) was
  already converted in Phase 24 and remains the real `ZonoMap`.

### Which were renamed (map wording removed)
- "מפת ההזדמנויות" → "תובנות אזוריות" (home).
- "מפת ביקוש ומחירים" → "מדדי ביקוש ומחירים" (/market) + button "חשב מדדי ביקוש מחדש" + honest empty state.
- "מפת פוטנציאל גיוס לפי אזורים" → "פוטנציאל גיוס לפי אזורים" (/acquisition).
- "מפת חום פעילות" → "פעילות לפי שעות" (/command).
- "מפת חום צוותית — מוביל לפי אזור" → "מוביל לפי אזור (צוות)" (/routing).
- "מפת תחרות — שליטה בשכונות" → "שליטה תחרותית בשכונות" (/competitors).
- "מפת בעלות" → "בעלויות הנכס" (seller 360).
- Nav: "מפה חכמה" / "מפת הזדמנויות" / "מפת ביקוש" → "מודיעין שוק" / "מדדי ביקוש"
  (Sidebar, command-center, registry, mock).
- Engine label strings: "מפת ביקוש"→"מדדי ביקוש" (decision-intelligence),
  "מפת הזדמנויות"/"מפת תחרות"→"תובנות הזדמנויות"/"ניתוח תחרות" (ai-office),
  system-health registry label.

### Which were hidden
- None needed hiding — every surface became either a real map (Properties) or an
  honest non-map visualization.

### Which still require geo data (future real maps)
- **Deals map** — needs deal/transaction coordinates (Phase 25.2 geocoding).
- **Market/Recommendations geographic heat** — needs polygons/point centroids
  (Phase 25.3). Today they are honest ranked panels.

## 7. Exact files changed
`src/components/dashboard-home/components/ReferenceSections.tsx`,
`src/components/dashboard/sections/HeatmapSection.tsx`,
`src/components/dashboard/Sidebar.tsx`,
`src/components/navigation/zono-command-center.tsx`,
`src/data/mock.ts`, `src/lib/navigation/registry.ts`, `src/lib/system/service.ts`,
`src/lib/ai-office/engine.ts`, `src/lib/decision-intelligence/service.ts`,
`src/app/(app)/market/MarketHeatmapView.tsx`,
`src/app/(app)/acquisition/AcquisitionDashboard.tsx`,
`src/app/(app)/command/ExecutiveCommandCenter.tsx`,
`src/app/(app)/routing/RoutingView.tsx`,
`src/app/(app)/competitors/CompetitorsDashboard.tsx`,
`src/app/(app)/sellers/[id]/Seller360Sections.tsx`,
`src/app/(app)/properties/PropertiesOSView.tsx`,
`src/app/(app)/recommendations/map/page.tsx`.

## 8. Routes affected
`/` (home), `/market`, `/acquisition`, `/command`, `/routing`, `/competitors`,
`/sellers/[id]`, `/properties`, `/recommendations/map`, plus the global nav.

## 9. Remaining limitations
- Real geographic maps exist only where real coordinates exist (Properties). Deals,
  market heat, recommendations and territories remain honest non-map panels until
  geocoding (25.2) and polygons (25.3) land.
- `/recommendations/map` route path still contains the word "map" though its title
  and content are non-map ("אזורי ביקוש"); renaming the route path is deferred to
  avoid breaking links (no map is shown).
- False-positive "מפ" strings left intentionally: "מפתח"/"מפתחות" (key/keys),
  "מפתח המפה" (API key), and the real-map helper copy in `LocationMap`/`ZonoMap`.

## 10/11. TypeScript / ESLint
Both clean (0 errors / 0 problems) on all changed files. No DB/migration change in
this phase (UI/text only).

## Acceptance check
✅ No fake map remains · ✅ no grid/scatter/SVG labeled as map · ✅ no "מפת" title
without a real geographic map · ✅ no percentage-position pins · ✅ no decorative
heat zones · ✅ Properties map still real · ✅ non-geo features labeled as
insights/analysis · ✅ ZONO design preserved · ✅ TypeScript + ESLint pass.
