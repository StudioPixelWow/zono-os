"use client";
// ============================================================================
// ZONO — Shared real map (MapLibre GL over OpenStreetMap), in the ZONO design
// language. NO Google Maps.
// ----------------------------------------------------------------------------
// HARD RULES:
//   • REAL data only — render markers/heat ONLY for points that carry real
//     lat/lng. NO mock fallback, NO random pins, NO invented coordinates.
//   • If there are no real points (and no polygons) → honest empty state.
//   • Visuals inherit ZONO: dark-purple OSM style, branded markers/clusters,
//     branded popovers, soft glow, rounded card, RTL-safe overlays.
//   • Tile source is env-configurable (NEXT_PUBLIC_MAP_TILE_URL / _STYLE_URL);
//     with no env a documented OSM dev fallback is used. No API key required.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker as MLMarker, Popup as MLPopup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";
import {
  resolveZonoMapStyle, ISRAEL_CENTER, brandedMarkerSvg, MAP_BRAND, TONE_COLOR, type MapTone,
} from "@/lib/maps/map-style";

export interface ZonoMapPoint {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  /** Lines of secondary text shown in the branded popover. */
  details?: string[];
  tone?: MapTone;
  href?: string;
  /** Optional real cover image shown at the top of the popover (no placeholder). */
  imageUrl?: string | null;
  /** Heat contribution 0..1 (weighted intelligence). Defaults to 1 (density). */
  weight?: number;
}

/** An optional area polygon (e.g. broker expertise area / neighborhood). */
export interface ZonoMapPolygon {
  id: string;
  /** Ring of real coordinates (no fake geometry — empty rings are ignored). */
  positions: Array<{ lat: number; lng: number }>;
  tone?: MapTone;
  title?: string;
}

export interface ZonoMapProps {
  points: ZonoMapPoint[];
  className?: string;
  heightClass?: string;
  /** Honest message shown when there are zero real-coordinate points. */
  emptyMessage?: string;
  /** Cluster when more than this many points are present. */
  clusterThreshold?: number;
  initialZoom?: number;
  /** Render a real density heat overlay instead of markers. The heat reflects
   *  the density of REAL points only — no fake heat is ever drawn. */
  heatmap?: boolean;
  /** With `heatmap`, also reveal individual property markers once zoomed past
   *  `markerRevealZoom` (heat when zoomed out → pins at street/building level). */
  markersWithHeat?: boolean;
  /** Zoom at which markers appear on top of / instead of heat (default 14). */
  markerRevealZoom?: number;
  /** Optional real area polygons (broker expertise / neighborhoods). */
  polygons?: ZonoMapPolygon[];
  /** When provided, clicking a single property marker calls this with the point
   *  id INSTEAD of opening the popup link — so the consumer can open an internal
   *  ZONO preview drawer. External sources are never a navigation target. */
  onSelect?: (id: string) => void;
}

// ZONO-purple heat ramp (transparent → lavender → violet → deep purple).
const HEAT_COLOR: [number, string][] = [
  [0, "rgba(124,58,237,0)"], [0.2, "rgba(167,139,250,0.55)"], [0.4, "rgba(139,92,246,0.78)"],
  [0.6, "rgba(124,58,237,0.9)"], [0.8, "rgba(91,33,182,0.96)"], [1, "rgba(67,20,140,1)"],
];

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Branded, ZONO-styled property card popover (real image header when present,
 *  clean dark card, no placeholder image). */
function infoHtml(p: ZonoMapPoint): string {
  const lines = (p.details ?? []).filter(Boolean);
  const sub = lines[0] ? `<div style="color:${MAP_BRAND.muted};font-size:11.5px;font-weight:600">${esc(lines[0])}</div>` : "";
  const price = lines[1] ? `<div style="color:${MAP_BRAND.ink};font-size:14px;font-weight:800;margin-top:3px">${esc(lines[1])}</div>` : "";
  const meta = lines[2] ? `<div style="color:${MAP_BRAND.muted};font-size:11px;margin-top:5px;opacity:.85">${esc(lines[2])}</div>` : "";
  const img = p.imageUrl
    ? `<div style="height:118px;background:#0e0a1f center/cover no-repeat url('${esc(p.imageUrl)}')"></div>`
    : `<div style="height:6px;background:linear-gradient(90deg,${MAP_BRAND.brand},${MAP_BRAND.violet})"></div>`;
  const link = p.href
    ? `<a href="${esc(p.href)}" style="display:inline-flex;align-items:center;gap:5px;margin-top:11px;color:#fff;background:linear-gradient(135deg,${MAP_BRAND.violet},${MAP_BRAND.purple});font-size:12px;font-weight:800;text-decoration:none;padding:7px 13px;border-radius:10px">פתח ←</a>`
    : "";
  return `<div dir="rtl" style="width:230px;overflow:hidden;border-radius:16px;background:${MAP_BRAND.bgPanel};border:1px solid #2c2056;box-shadow:0 18px 44px rgba(8,4,22,.5);font-family:inherit">
    ${img}
    <div style="padding:12px 14px 14px">
      <div style="color:#fff;font-size:14px;font-weight:800;line-height:1.3">${esc(p.title ?? "מיקום")}</div>
      ${sub}${price}${meta}${link}
    </div>
  </div>`;
}

/** Grid-cluster points by current zoom; returns clusters (count>1) + singles.
 *  The cell is sized in SCREEN SPACE (~a fixed pixel grid), so clusters break
 *  apart into individual points as you zoom in. Previously the cell was a coarse
 *  fraction of the whole world (≈km even at high zoom), so an entire neighborhood
 *  collapsed into a single cluster and never expanded. */
function clusterPoints(points: ZonoMapPoint[], zoom: number): Array<{ lat: number; lng: number; items: ZonoMapPoint[] }> {
  // degrees-per-pixel at this zoom × ~a 64px cluster radius.
  const degPerPx = 360 / (256 * Math.pow(2, Math.max(1, zoom)));
  const cell = Math.max(degPerPx * 64, 1e-6);
  const grid = new Map<string, { lat: number; lng: number; items: ZonoMapPoint[] }>();
  for (const p of points) {
    const key = `${Math.round(p.lat / cell)}:${Math.round(p.lng / cell)}`;
    const g = grid.get(key);
    if (g) { g.items.push(p); g.lat = (g.lat * (g.items.length - 1) + p.lat) / g.items.length; g.lng = (g.lng * (g.items.length - 1) + p.lng) / g.items.length; }
    else grid.set(key, { lat: p.lat, lng: p.lng, items: [p] });
  }
  return [...grid.values()];
}

const polyRing = (poly: ZonoMapPolygon) =>
  poly.positions.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));

export function ZonoMap({
  points,
  className,
  heightClass = "h-80",
  emptyMessage = "אין עדיין נתוני מיקום אמיתיים להצגה על המפה.",
  clusterThreshold = 60,
  initialZoom = 11,
  heatmap = false,
  markersWithHeat = false,
  markerRevealZoom = 14,
  polygons = [],
  onSelect,
}: ZonoMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<MLPopup | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  // Keep the latest onSelect without rebuilding the whole map.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const realPoints = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const realPolys = polygons.map(polyRing).filter((r) => r.length >= 3);
  const hasGeo = realPoints.length > 0 || realPolys.length > 0;

  // Stable geometry signatures so the map only rebuilds when real data changes.
  const pointsSig = realPoints.map((p) => p.id + p.lat + p.lng + (p.tone ?? "")).join("|");
  const polysSig = realPolys.map((r) => r.length).join("|");

  useEffect(() => {
    if (!hasGeo || !ref.current) return;
    let cancelled = false;
    let map: MLMap | null = null;

    (async () => {
      const [maplibregl, style] = await Promise.all([
        import("maplibre-gl").then((m) => m.default),
        resolveZonoMapStyle(),
      ]);
      if (cancelled || !ref.current) return;

      map = new maplibregl.Map({
        container: ref.current,
        style,
        center: realPoints[0] ? [realPoints[0].lng, realPoints[0].lat] : [ISRAEL_CENTER.lng, ISRAEL_CENTER.lat],
        zoom: initialZoom,
        maxZoom: 19, // building-level detail (raster tiles cap at 19)
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      // Only surface the error overlay if the map never finished loading. Once
      // it's up, ignore transient per-tile errors so a hiccup never blanks it.
      let ready = false;
      map.on("error", () => { if (!cancelled && !ready) setState("error"); });

      const drawMarkers = () => {
        if (!map) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        if (realPoints.length === 0) return;
        const zoom = map.getZoom() ?? initialZoom;
        // Heat-only when zoomed out; reveal individual pins at street/building
        // level (markersWithHeat), or never when it's a pure heat map.
        if (heatmap && !markersWithHeat) return;
        if (heatmap && markersWithHeat && zoom < markerRevealZoom) return;

        const groups = realPoints.length > clusterThreshold
          ? clusterPoints(realPoints, zoom)
          : realPoints.map((p) => ({ lat: p.lat, lng: p.lng, items: [p] }));

        for (const g of groups) {
          if (g.items.length > 1) {
            const size = Math.min(54, 30 + g.items.length);
            const el = document.createElement("div");
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:${MAP_BRAND.purple}ed;border:2px solid ${MAP_BRAND.lavender};color:${MAP_BRAND.ink};font:700 12px/1 inherit;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 18px rgba(109,40,217,0.45)`;
            el.textContent = String(g.items.length);
            el.addEventListener("click", (e) => { e.stopPropagation(); map?.easeTo({ center: [g.lng, g.lat], zoom: Math.min(19, zoom + 2) }); });
            markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([g.lng, g.lat]).addTo(map));
          } else {
            const p = g.items[0];
            // A <div> (NOT an <img>) so the browser's native image drag can never
            // swallow the click. The marker SVG is a background image.
            const el = document.createElement("div");
            el.style.cssText = `width:30px;height:39px;cursor:pointer;background:center/contain no-repeat url("${brandedMarkerSvg(p.tone ?? "brand")}")`;
            el.addEventListener("click", (e) => {
              e.stopPropagation(); // don't let the map receive it (would close the popup)
              // Preferred: open an internal ZONO preview drawer (never navigate out).
              if (onSelectRef.current) { popupRef.current?.remove(); onSelectRef.current(p.id); return; }
              popupRef.current?.remove();
              popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 28, maxWidth: "240px", className: "zono-pop" })
                .setLngLat([p.lng, p.lat]).setHTML(infoHtml(p)).addTo(map!);
            });
            markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
          }
        }
      };

      map.on("load", () => {
        if (!map || cancelled) return;

        // ── Polygons (real area geometry only) ────────────────────────────────
        if (realPolys.length) {
          map.addSource("zono-polys", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: realPolys.map((ring, i) => ({
                type: "Feature" as const,
                properties: { color: TONE_COLOR[polygons[i]?.tone ?? "brand"] },
                geometry: { type: "Polygon" as const, coordinates: [[...ring, ring[0]].map((c) => [c.lng, c.lat])] },
              })),
            },
          });
          map.addLayer({ id: "zono-poly-fill", type: "fill", source: "zono-polys", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.16 } });
          map.addLayer({ id: "zono-poly-line", type: "line", source: "zono-polys", paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.85 } });
        }

        // ── Heatmap (real point density only) ─────────────────────────────────
        if (heatmap && realPoints.length) {
          map.addSource("zono-heat", {
            type: "geojson",
            data: { type: "FeatureCollection", features: realPoints.map((p) => ({ type: "Feature" as const, properties: { w: typeof p.weight === "number" ? p.weight : 1 }, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } })) },
          });
          map.addLayer({
            id: "zono-heat-layer",
            type: "heatmap",
            source: "zono-heat",
            paint: {
              // Weighted intelligence: each point contributes by its business value.
              "heatmap-weight": ["interpolate", ["linear"], ["get", "w"], 0, 0, 1, 1],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 16, 2.4],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 16, 34],
              "heatmap-opacity": 0.8,
              "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], ...HEAT_COLOR.flat()],
            },
          });
        }

        drawMarkers();
        map.on("moveend", drawMarkers);

        // Fit to all real geometry.
        const coords: [number, number][] = [
          ...realPoints.map((p) => [p.lng, p.lat] as [number, number]),
          ...realPolys.flatMap((r) => r.map((c) => [c.lng, c.lat] as [number, number])),
        ];
        if (coords.length === 1) { map.jumpTo({ center: coords[0], zoom: 16 }); }
        else if (coords.length > 1) {
          const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
          map.fitBounds(b, { padding: 48, maxZoom: 17, duration: 0 });
        }
        ready = true;
        if (!cancelled) setState("ready");
      });
    })().catch(() => { if (!cancelled) setState("error"); });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsSig, polysSig, heatmap, markersWithHeat, markerRevealZoom, clusterThreshold, initialZoom]);

  // Live-update the weighted heat when the active layer's weights change — no map
  // rebuild (smooth transition; supports large datasets efficiently).
  const weightSig = heatmap ? realPoints.map((p) => Math.round((p.weight ?? 1) * 20)).join("") : "";
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !heatmap) return;
    const apply = () => {
      const src = m.getSource("zono-heat") as import("maplibre-gl").GeoJSONSource | undefined;
      if (!src) return;
      src.setData({ type: "FeatureCollection", features: realPoints.map((p) => ({ type: "Feature" as const, properties: { w: typeof p.weight === "number" ? p.weight : 1 }, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } })) });
    };
    if (m.isStyleLoaded()) apply(); else m.once("idle", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightSig, heatmap]);

  const shell = "border-line bg-card relative w-full overflow-hidden rounded-card border shadow-card";

  // No real coordinates (and no polygons) → honest empty state (never invented).
  if (!hasGeo) {
    return (
      <div className={cn(shell, heightClass, "grid place-items-center text-center", className)}>
        <p className="text-muted px-6 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn(shell, heightClass, className)}>
      <div ref={ref} dir="ltr" className="absolute inset-0 h-full w-full" />
      {state === "loading" && (
        <div className="bg-card/70 absolute inset-0 grid place-items-center backdrop-blur-sm">
          <span className="text-muted text-xs font-semibold">טוען מפה…</span>
        </div>
      )}
      {state === "error" && (
        <div className="bg-card/90 absolute inset-0 grid place-items-center text-center">
          <div className="px-6">
            <p className="text-danger text-xs font-bold">שירות המפות לא זמין כעת.</p>
            <p className="text-muted mt-1.5 text-[11px] leading-relaxed">המפה לא נטענה. בדוק/י חיבור אינטרנט. בפרודקשן יש להגדיר ספק אריחים דרך NEXT_PUBLIC_MAP_TILE_URL או NEXT_PUBLIC_MAP_STYLE_URL.</p>
          </div>
        </div>
      )}
    </div>
  );
}
