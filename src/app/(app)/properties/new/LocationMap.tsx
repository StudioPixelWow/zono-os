"use client";
// ============================================================================
// ZONO — Property location picker (MapLibre GL over OpenStreetMap). NO Google.
// ----------------------------------------------------------------------------
// Interactive: click or drag the pin to set coordinates; "אתר על המפה" geocodes
// the typed address via OSM Nominatim (free, keyless). Tiles come from the
// shared ZONO MapLibre style (env-configurable, OSM dev fallback). No API key.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { resolveZonoMapStyle, ISRAEL_METRO } from "@/lib/maps/map-style";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-muted text-xs font-semibold";

/** Geocode an address via OSM Nominatim (keyless). Israel-biased. */
async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "he" } });
  if (!res.ok) throw new Error("geocode_failed");
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

function MapPicker({
  latitude,
  longitude,
  addressQuery,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  onChange: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  const [status, setStatus] = useState<"" | "locating" | "ok" | "notfound" | "error">("");

  const place = (lat: number, lng: number, fly = true) => {
    markerRef.current?.setLngLat([lng, lat]);
    if (fly) mapRef.current?.easeTo({ center: [lng, lat], zoom: 16 });
    onChange(lat, lng);
  };

  const geocode = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setStatus("locating");
    try {
      const hit = await nominatimGeocode(q);
      if (hit) { place(hit.lat, hit.lng); setStatus("ok"); }
      else setStatus("notfound");
    } catch { setStatus("error"); }
  };

  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;
    (async () => {
      const [maplibregl, style] = await Promise.all([
        import("maplibre-gl").then((m) => m.default),
        resolveZonoMapStyle(),
      ]);
      if (cancelled || !ref.current) return;
      const hasCoords = latitude != null && longitude != null;
      const center: [number, number] = hasCoords ? [longitude as number, latitude as number] : [ISRAEL_METRO.lng, ISRAEL_METRO.lat];
      map = new maplibregl.Map({
        container: ref.current,
        style,
        center,
        zoom: hasCoords ? 15 : 8,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      const marker = new maplibregl.Marker({ color: "#7c3aed", draggable: true }).setLngLat(center).addTo(map);
      markerRef.current = marker;
      marker.on("dragend", () => { const l = marker.getLngLat(); onChange(l.lat, l.lng); });
      map.on("click", (e) => { marker.setLngLat(e.lngLat); onChange(e.lngLat.lat, e.lngLat.lng); });
      // Auto-locate from the address if no coordinates yet.
      if (!hasCoords && addressQuery.trim()) { const q = addressQuery; setTimeout(() => { if (!cancelled) geocode(q); }, 0); }
    })().catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => geocode(addressQuery)}
          className="bg-brand-soft text-brand-strong hover:bg-brand hover:text-white inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition"
        >
          אתר את הכתובת על המפה
        </button>
        {status === "locating" && <span className="text-muted text-xs">מאתר…</span>}
        {status === "notfound" && <span className="text-danger text-xs">הכתובת לא נמצאה — נסה/י לדייק</span>}
        {status === "error" && <span className="text-danger text-xs">שירות האיתור לא זמין כרגע — נסה/י שוב</span>}
        {status === "ok" && <span className="text-success text-xs">המיקום עודכן ✓</span>}
      </div>
      <div ref={ref} dir="ltr" className="border-line h-56 w-full overflow-hidden rounded-2xl border" />
      <p className="text-muted text-[11px]">לחיצה או גרירת הסמן על המפה תעדכן את המיקום ידנית.</p>
    </div>
  );
}

/**
 * Location coordinates + interactive OSM/MapLibre map. Geocodes the typed
 * address ("אתר על המפה" + auto on load) via OSM Nominatim and offers a
 * draggable/clickable pin. No Google Maps key required.
 */
export function LocationMap({
  latitude,
  longitude,
  addressQuery,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>קו רוחב (lat)</span>
          <input
            type="number"
            step="any"
            dir="ltr"
            className={`${field} mt-1`}
            value={latitude ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null, longitude)}
          />
        </label>
        <label className="block">
          <span className={label}>קו אורך (lng)</span>
          <input
            type="number"
            step="any"
            dir="ltr"
            className={`${field} mt-1`}
            value={longitude ?? ""}
            onChange={(e) => onChange(latitude, e.target.value ? Number(e.target.value) : null)}
          />
        </label>
      </div>

      <MapPicker
        latitude={latitude}
        longitude={longitude}
        addressQuery={addressQuery}
        onChange={(lat, lng) => onChange(lat, lng)}
      />
    </div>
  );
}
