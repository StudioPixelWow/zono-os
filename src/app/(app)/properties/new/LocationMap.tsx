"use client";

import { useEffect, useRef } from "react";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-muted text-xs font-semibold";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const ISRAEL_CENTER = { lat: 32.0853, lng: 34.7818 };

// ── Minimal typed surface for the bits of the Google Maps JS API we use ──────
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
}
interface GoogleMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
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
  onChange,
}: {
  apiKey: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !ref.current) return;
        const w = window as unknown as { google?: GoogleNS };
        const maps = w.google?.maps;
        if (!maps) return;
        const center =
          latitude != null && longitude != null
            ? { lat: latitude, lng: longitude }
            : ISRAEL_CENTER;
        const map = new maps.Map(ref.current, {
          center,
          zoom: latitude != null ? 15 : 8,
        });
        const marker = new maps.Marker({ position: center, map, draggable: true });
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
      })
      .catch(() => {
        /* fall back silently to inputs */
      });
    return () => {
      cancelled = true;
    };
    // Init once; coordinate edits flow through inputs without re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="border-line h-56 w-full rounded-2xl border" />;
}

/**
 * Location coordinates + map. With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY → an
 * interactive Google map with a draggable pin (click/drag updates lat/lng).
 * Without a key → numeric inputs + a keyless embedded preview.
 */
export function LocationMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
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
        <>
          <GoogleMapPicker
            apiKey={MAPS_KEY}
            latitude={latitude}
            longitude={longitude}
            onChange={(lat, lng) => onChange(lat, lng)}
          />
          <p className="text-muted text-[11px]">לחיצה או גרירת הסמן על המפה תעדכן את המיקום.</p>
        </>
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
          הזן/י קואורדינטות לתצוגת מפה. לפין נגרר אינטראקטיבי — הגדר/י
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
        </p>
      )}
    </div>
  );
}
