# ZONO — Remaining Map Surfaces, Eliminated (Phase 24.2)

**Date:** 2026-06-24
**Goal:** Finish the fake→real map transition. The Properties map is already real
(Phase 24). This phase removed the last three decorative/simulated geographic
visualizations. **Critical rule honored: a fake map was never replaced with another
fake map** — where no real coordinates exist we show an honest state / non-map
panel, never simulated geography.

**Verification:** scoped `tsc --noEmit` (DealsSection, HeatmapSection, HeroSection,
RealContainers) = **0 errors**; `eslint` (the three converted files) = **0 problems**.
No migration required (UI/data-presentation only; no schema change).

---

## 1. Remaining fake map surfaces (found)

| Surface | File | What was fake |
|---|---|---|
| **CityMap** | `src/components/dashboard/CityMap.tsx` | Decorative SVG "city" (streets/river/blocks) with **percentage-based** pins (`xPct/yPct`). Pure simulation. |
| **HeatmapSection** | `dashboard/sections/HeatmapSection.tsx` | Real locality demand data **painted onto hardcoded SVG polygon slots** — real numbers, **fake geography/positions**. |
| **DealsSection** | `dashboard/sections/DealsSection.tsx` | Recent deals plotted on `CityMap` via mock `xPct/yPct`. Deals have **no real coordinates**. |
| **HeroSection map** | `dashboard/sections/HeroSection.tsx` | `CityMap` "מפה להמחשה" (explicitly a demo illustration). |

### Real-geo readiness classification
| Component | Classification | Reason |
|---|---|---|
| CityMap | **DECORATIVE_ONLY** | no real coordinate source anywhere; retired |
| HeatmapSection | **NEEDS_GEO_DATA** | has real locality demand, but no point/polygon geography (needs Phase 25.3 polygons) |
| DealsSection | **NEEDS_GEO_DATA** | deals carry no lat/lng (per REAL_GEO_DATA_AUDIT) |
| HeroSection map | **DECORATIVE_ONLY** | illustrative only |
| Properties map | **READY_FOR_REAL_MAP** ✅ | already converted to real `ZonoMap` in Phase 24 |

## 2. Which were safe to convert now
- **HeatmapSection → real "Market Intelligence Panel" (no map).** The real locality
  demand data it already receives (`getCurrentMarketHeatmap()` → name, demand−supply
  change %, heat tone, heat label) is now rendered as a **ranked locality list** with
  tone dots and change %, plus the AI insight line — no SVG, no fake polygons, no
  simulated positions. Section renamed **"מפת הביקוש בעיר" → "מודיעין ביקוש שכונתי"**.

## 3. Which require geo data first (no map shown yet)
- **DealsSection** — map area replaced with the honest placeholder:
  *"התצוגה הגאוגרפית תהיה זמינה כאשר לעסקאות יהיו קואורדינטות אמיתיות."* The deals
  list is unchanged. Becomes a real `ZonoMap` once deal/transaction coordinates exist
  (Phase 25.2 geocoding).
- **HeatmapSection (true map)** — a real geographic heat map waits on polygon/point
  infrastructure (Phase 25.3/25.5). Until then it's the honest intelligence panel
  above, with a note: *"מפה גאוגרפית מלאה תתווסף עם תשתית הגבולות (פוליגונים)."*

## 4. Which were hidden / removed
- **`CityMap.tsx` deleted** (dead after both usages removed; not in barrel exports;
  zero remaining references).
- The fake **SVG polygon heatmap** and its `fill`/`stroke`/`points` rendering removed.
- The **hero decorative city map** removed.

## 5. Which were renamed / re-pointed
- HeatmapSection title → **"מודיעין ביקוש שכונתי"** (it is intelligence, not a map).
- **HeroSection** map block → an honest **branded CTA panel** (dark-purple gradient,
  ZONO glow, MapPin) that links to **/properties** (the real map). It no longer
  implies geography; it routes the user to the real map.

## 6. Estimated implementation effort (already done this phase)
| Item | Effort |
|---|---|
| DealsSection honest placeholder | ~0.2h ✅ |
| HeatmapSection → intelligence panel | ~0.6h ✅ |
| HeroSection branded CTA | ~0.3h ✅ |
| Delete CityMap + cleanup imports | ~0.1h ✅ |
| **Future** real deal map (after 25.2 geocoding) | ~0.5h |
| **Future** real heat map (after 25.3 polygons) | ~1–2d |

## 7. Design system preservation
All conversions stay in ZONO's language — no Google default styling anywhere:
- Cards use `bg-card` + `border-line` + `shadow-card`/`shadow-soft`, radius `[24px]`.
- Hero panel uses the ZONO deep-purple gradient (`#140d2b→#241a4d`), `zono-gradient-glow`
  orb, lavender text (`#c4b5fd`), existing spacing/typography, RTL preserved.
- Tone dots reuse brand/success/warning/danger tokens; the AI insight reuses `ZonoOrb`.
- The only real map (Properties) remains the branded dark-purple `ZonoMap`.

## 8. TypeScript / ESLint status
- `tsc --noEmit` on the converted files + their container → **0 errors**.
- `eslint` on the three converted files → **0 problems**.
- No schema/migration change in this phase.

### Net result
No simulated geography remains in ZONO. Every map surface is now one of:
**real map (Properties)**, **honest "needs coordinates" placeholder (Deals)**,
**real non-map intelligence panel (Heatmap)**, or **branded CTA to the real map
(Hero)**. Fake maps: **0**.
