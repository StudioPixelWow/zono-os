"use client";

import { useEffect, useRef, useState } from "react";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-muted text-xs font-semibold";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const ISRAEL_CENTER = { lat: 32.0853, lng: 34.7818 };

// ── Minimal typed surface for the Google Maps JS API we use ──────────────────
interface GLatLng {
  lat(): number;
  lng(): number;
}
interface GMapMouseEvent {
  latLng: GLatLng | null;
}
interface GMarker {
  addListener(event: string, cb: (e: GMapMouseEvent) => void): void;
  getPosition(): GLatLng | null;
  setPosition(p: { lat: number; lng: number }): void;
}
interface GMap {
  addListener(event: string, cb: (e: GMapMouseEvent) => void): void;
  setCenter(p: { lat: number; lng: number }): void;
  setZoom(z: number): void;
}
interface GGeocoderResult {
  geometry: { location: GLatLng };
}
interface GGeocoder {
  geocode(
    req: { address: string; region?: string },
    cb: (results: GGeocoderResult[] | null, status: string) => void,
  ): void;
}
interface GoogleMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Geocoder: new () => GGeocoder;
}
interface GoogleNS {
  maps: GoogleMaps;
}

let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { google?: GoogleNS };
  if (w.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

function GoogleMapPicker({
  apiKey,
  latitude,
  longitude,
  addressQuery,
  onChange,
}: {
  apiKey: string;
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  onChange: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);
  const geocoderRef = useRef<GGeocoder | null>(null);
  const [status, setStatus] = useState<
    "" | "locating" | "ok" | "notfound" | "error"
  >("");

  const place = (lat: number, lng: number) => {
    markerRef.current?.setPosition({ lat, lng });
    mapRef.current?.setCenter({ lat, lng });
    mapRef.current?.setZoom(16);
    onChange(lat, lng);
  };

  const geocode = (query: string) => {
    const q = query.trim();
    if (!q || !geocoderRef.current) return;
    setStatus("locating");
    geocoderRef.current.geocode({ address: q, region: "il" }, (results, st) => {
      if (st === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        place(loc.lat(), loc.lng());
        setStatus("ok");
      } else if (st === "ZERO_RESULTS") {
        setStatus("notfound");
      } else {
        // REQUEST_DENIED / OVER_QUERY_LIMIT / billing not enabled, etc.
        setStatus("error");
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !ref.current) return;
        const w = window as unknown as { google?: GoogleNS };
        const maps = w.google?.maps;
        if (!maps) return;
        const hasCoords = latitude != null && longitude != null;
        const center = hasCoords ? { lat: latitude, lng: longitude } : ISRAEL_CENTER;
        const map = new maps.Map(ref.current, { center, zoom: hasCoords ? 15 : 8 });
        const marker = new maps.Marker({ position: center, map, draggable: true });
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = new maps.Geocoder();
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) onChange(p.lat(), p.lng());
        });
        map.addListener("click", (e: GMapMouseEvent) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            marker.setPosition({ lat, lng });
            onChange(lat, lng);
          }
        });
        // Auto-locate from the address if no coordinates yet (deferred so it
        // doesn't setState synchronously inside the effect).
        if (!hasCoords && addressQuery.trim()) {
          const q = addressQuery;
          setTimeout(() => {
            if (!cancelled) geocode(q);
          }, 0);
        }
      })
      .catch(() => {
        /* silent fallback */
      });
    return () => {
      cancelled = true;
    };
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
        {status === "error" && (
          <span className="text-danger text-xs">שירות המפות לא זמין — יש להפעיל Billing ו-Geocoding API</span>
        )}
        {status === "ok" && <span className="text-success text-xs">המיקום עודכן ✓</span>}
      </div>
      <div ref={ref} className="border-line h-56 w-full rounded-2xl border" />
      <p className="text-muted text-[11px]">לחיצה או גרירת הסמן על המפה תעדכן את המיקום ידנית.</p>
    </div>
  );
}

/**
 * Location coordinates + map. With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY → interactive
 * Google map: geocodes the typed address ("אתר על המפה" + auto on load) and a
 * draggable pin. Without a key → numeric inputs + keyless embed preview.
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
  const hasCoords = latitude != null && longitude != null;

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
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : null, longitude)
            }
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
            onChange={(e) =>
              onChange(latitude, e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
      </div>

      {MAPS_KEY ? (
        <GoogleMapPicker
          apiKey={MAPS_KEY}
          latitude={latitude}
          longitude={longitude}
          addressQuery={addressQuery}
          onChange={(lat, lng) => onChange(lat, lng)}
        />
      ) : hasCoords ? (
        <div className="border-line overflow-hidden rounded-2xl border">
          <iframe
            title="מפה"
            className="h-56 w-full"
            loading="lazy"
            src={`https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`}
          />
        </div>
      ) : (
        <p className="text-muted bg-surface rounded-2xl px-4 py-6 text-center text-xs">
          הזן/י קואורדינטות לתצוגת מפה. לאיתור אוטומטי לפי כתובת — הגדר/י
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
        </p>
      )}
    </div>
  );
}
