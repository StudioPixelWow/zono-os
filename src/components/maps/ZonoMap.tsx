"use client";
// ============================================================================
// ZONO — Shared real map (Google Maps JS), styled in the ZONO design language.
// ----------------------------------------------------------------------------
// HARD RULES (Phase 24):
//   • REAL data only — render markers ONLY for points that carry real lat/lng.
//   • NO mock fallback, NO random pins, NO invented coordinates.
//   • If the API key is missing → honest "map unavailable" state.
//   • If there are no real points → honest empty state (caller-supplied copy).
//   • Visuals inherit ZONO: dark-purple custom style, branded markers/clusters,
//     branded info windows, soft glow, rounded card, RTL-safe.
// The map JS key is the PUBLIC key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) by design —
// the server-side geocoding key stays server-only (see src/lib/maps/geocoding.ts).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ZONO_MAP_STYLE, ISRAEL_CENTER, brandedMarkerSvg, MAP_BRAND, type MapTone,
} from "@/lib/maps/map-style";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface ZonoMapPoint {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  /** Lines of secondary text shown in the branded info window. */
  details?: string[];
  tone?: MapTone;
  href?: string;
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
}

// ── Minimal typed surface for the Google Maps JS API we use ──────────────────
interface GLatLng { lat(): number; lng(): number }
interface GMarker {
  setMap(map: GMap | null): void;
  addListener(ev: string, cb: () => void): void;
  getPosition(): GLatLng | null;
}
interface GInfoWindow { setContent(c: string): void; open(map: GMap, anchor?: GMarker): void; close(): void }
interface GBounds { extend(p: { lat: number; lng: number }): void; isEmpty(): boolean }
interface GMap {
  fitBounds(b: GBounds, padding?: number): void;
  setCenter(p: { lat: number; lng: number }): void;
  setZoom(z: number): void;
  getZoom(): number | undefined;
  addListener(ev: string, cb: () => void): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  InfoWindow: new (opts?: Record<string, unknown>) => GInfoWindow;
  LatLngBounds: new () => GBounds;
  Size: new (w: number, h: number) => unknown;
  Point: new (x: number, y: number) => unknown;
}
interface GoogleNS { maps: GMaps }

let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { google?: GoogleNS };
  if (w.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("maps_load_failed"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Branded, ZONO-styled info-window HTML (dark panel, lavender text, glow). */
function infoHtml(p: ZonoMapPoint): string {
  const details = (p.details ?? []).filter(Boolean).map((d) => `<div style="color:${MAP_BRAND.muted};font-size:12px;line-height:1.5">${esc(d)}</div>`).join("");
  const link = p.href
    ? `<a href="${esc(p.href)}" style="color:${MAP_BRAND.lavender};font-size:12px;font-weight:700;text-decoration:none">פתח ←</a>`
    : "";
  return `<div dir="rtl" style="background:${MAP_BRAND.bgPanel};border:1px solid #2c2056;border-radius:14px;padding:10px 12px;min-width:160px;box-shadow:0 12px 32px rgba(109,40,217,0.45);font-family:inherit">
    <div style="color:${MAP_BRAND.ink};font-size:13px;font-weight:800;margin-bottom:4px">${esc(p.title ?? "מיקום")}</div>
    ${details}${link ? `<div style="margin-top:6px">${link}</div>` : ""}
  </div>`;
}

/** Grid-cluster points by current zoom; returns clusters (count>1) + singles. */
function clusterPoints(points: ZonoMapPoint[], zoom: number): Array<{ lat: number; lng: number; items: ZonoMapPoint[] }> {
  // Cell size shrinks as you zoom in → fewer merges at high zoom.
  const cell = 360 / Math.pow(2, Math.max(1, zoom)) * 6;
  const grid = new Map<string, { lat: number; lng: number; items: ZonoMapPoint[] }>();
  for (const p of points) {
    const key = `${Math.round(p.lat / cell)}:${Math.round(p.lng / cell)}`;
    const g = grid.get(key);
    if (g) { g.items.push(p); g.lat = (g.lat * (g.items.length - 1) + p.lat) / g.items.length; g.lng = (g.lng * (g.items.length - 1) + p.lng) / g.items.length; }
    else grid.set(key, { lat: p.lat, lng: p.lng, items: [p] });
  }
  return [...grid.values()];
}

export function ZonoMap({
  points,
  className,
  heightClass = "h-80",
  emptyMessage = "אין עדיין נתוני מיקום אמיתיים להצגה על המפה.",
  clusterThreshold = 60,
  initialZoom = 11,
}: ZonoMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const infoRef = useRef<GInfoWindow | null>(null);
  const markersRef = useRef<GMarker[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const realPoints = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const hasKey = !!MAPS_KEY;

  useEffect(() => {
    if (!hasKey || realPoints.length === 0) return;
    let cancelled = false;
    loadGoogleMaps(MAPS_KEY as string)
      .then(() => {
        if (cancelled || !ref.current) return;
        const maps = (window as unknown as { google?: GoogleNS }).google?.maps;
        if (!maps) { setState("error"); return; }

        const map = mapRef.current ?? new maps.Map(ref.current, {
          center: ISRAEL_CENTER, zoom: initialZoom, styles: ZONO_MAP_STYLE,
          disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy",
          backgroundColor: MAP_BRAND.bgDeep,
        });
        mapRef.current = map;
        infoRef.current = infoRef.current ?? new maps.InfoWindow();

        const draw = () => {
          markersRef.current.forEach((m) => m.setMap(null));
          markersRef.current = [];
          const zoom = map.getZoom() ?? initialZoom;
          const groups = realPoints.length > clusterThreshold
            ? clusterPoints(realPoints, zoom)
            : realPoints.map((p) => ({ lat: p.lat, lng: p.lng, items: [p] }));

          for (const g of groups) {
            if (g.items.length > 1) {
              const size = Math.min(54, 30 + g.items.length);
              const bubble = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${MAP_BRAND.purple}" fill-opacity="0.92" stroke="${MAP_BRAND.lavender}" stroke-width="2"/></svg>`;
              const marker = new maps.Marker({
                position: { lat: g.lat, lng: g.lng }, map,
                icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(bubble)}`, scaledSize: new maps.Size(size, size), anchor: new maps.Point(size / 2, size / 2) },
                label: { text: String(g.items.length), color: MAP_BRAND.ink, fontSize: "12px", fontWeight: "700" },
              });
              marker.addListener("click", () => { map.setCenter({ lat: g.lat, lng: g.lng }); map.setZoom(Math.min(18, (map.getZoom() ?? zoom) + 2)); });
              markersRef.current.push(marker);
            } else {
              const p = g.items[0];
              const marker = new maps.Marker({
                position: { lat: p.lat, lng: p.lng }, map,
                icon: { url: brandedMarkerSvg(p.tone ?? "brand"), scaledSize: new maps.Size(34, 44), anchor: new maps.Point(17, 43) },
                title: p.title,
              });
              marker.addListener("click", () => { infoRef.current?.setContent(infoHtml(p)); infoRef.current?.open(map, marker); });
              markersRef.current.push(marker);
            }
          }
        };

        // Fit to all real points.
        const bounds = new maps.LatLngBounds();
        realPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        if (!bounds.isEmpty()) {
          if (realPoints.length === 1) { map.setCenter({ lat: realPoints[0].lat, lng: realPoints[0].lng }); map.setZoom(15); }
          else map.fitBounds(bounds, 48);
        }
        draw();
        map.addListener("idle", draw);
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(realPoints.map((p) => p.id + p.lat + p.lng)), hasKey]);

  const shell = "border-line bg-card relative w-full overflow-hidden rounded-card border shadow-card";

  // No public map key → honest unavailable state (never a fake map).
  if (!hasKey) {
    return (
      <div className={cn(shell, heightClass, "grid place-items-center text-center", className)}>
        <div className="px-6">
          <p className="text-ink text-sm font-bold">מפה לא זמינה</p>
          <p className="text-muted mt-1 text-xs">להצגת מפה אמיתית יש להגדיר את המפתח NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</p>
        </div>
      </div>
    );
  }

  // No real coordinates → honest empty state (never invented pins).
  if (realPoints.length === 0) {
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
          <p className="text-danger px-6 text-xs">שירות המפות לא זמין כעת. ודא שהמפתח תקין ו-Maps JavaScript API מופעל.</p>
        </div>
      )}
    </div>
  );
}
