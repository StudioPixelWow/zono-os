// ============================================================================
// ZONO — Map visual language (client-safe).
// ----------------------------------------------------------------------------
// A custom Google Maps style JSON that makes the map feel like part of ZONO:
// dark background, deep-purple tones, muted roads (NO bright green/yellow),
// subtle grid feeling. This is the visual source of truth so a real map never
// looks like a default Google Maps widget embedded in the dashboard.
//
// Brand tokens mirrored from globals.css:
//   brand #7c3aed · brand-strong #6d28d9 · violet #8b5cf6 · lavender #c4b5fd
// ============================================================================

export const ISRAEL_CENTER = { lat: 31.4118, lng: 34.9 } as const; // national view
export const ISRAEL_METRO = { lat: 32.0853, lng: 34.7818 } as const; // Tel-Aviv metro

/** ZONO brand colors reused by markers / clusters / info windows. */
export const MAP_BRAND = {
  purple: "#6d28d9",
  brand: "#7c3aed",
  violet: "#8b5cf6",
  lavender: "#c4b5fd",
  bgDeep: "#0e0a1f",
  bgPanel: "#171034",
  ink: "#ede9fe",
  muted: "#a78bfa",
  success: "#22c55e",
  warning: "#f5c451",
  danger: "#ef4444",
} as const;

/**
 * Dark-purple "ZONO Intelligence" map style. Roads are muted lavender (never
 * bright green/yellow), water/land are deep purple, labels are soft lavender.
 * Passed to `new google.maps.Map(..., { styles: ZONO_MAP_STYLE })`.
 */
export const ZONO_MAP_STYLE: Array<Record<string, unknown>> = [
  { elementType: "geometry", stylers: [{ color: "#140d2b" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a78bfa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0e0a1f" }, { weight: 2 }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3b2d63" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#c4b5fd" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d6c9ff" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#9a83d6" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1c1340" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8b75c4" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1a1838" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#7c6bb0" }] },
  // Roads: muted lavender, NOT bright green/yellow.
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#241a4d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a594d8" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#2c2056" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a2a6e" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#c4b5fd" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#1f1645" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#221748" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#a78bfa" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0a1f" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6d28d9" }] },
];

// ============================================================================
// MapLibre GL / OSM rendering (Phase: OSM migration).
// ----------------------------------------------------------------------------
// ZONO renders maps with MapLibre GL over OpenStreetMap tiles — NO Google Maps.
// The tile source is configurable via env so production can point at a proper
// provider; with no env a safe OSM raster dev fallback is used (documented as
// dev-only in docs/maps/OSM_MIGRATION_REPORT.md). The ZONO dark-purple look is
// achieved natively in the GL style (deep background + raster paint tint), so
// it stays consistent with the dashboard without any external styling service.
// ============================================================================
import type { StyleSpecification } from "maplibre-gl";
import { buildZonoVectorStyle, type ZonoMapThemeName } from "./zono-map-theme";

/** Public, client-safe map env (all optional). */
export const MAP_ENV = {
  /** Raster XYZ tile template, e.g. https://tiles.example/{z}/{x}/{y}.png */
  tileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL || "",
  /** A full MapLibre/vector style URL (overrides the raster style entirely). */
  styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "",
  /** Attribution string shown on the map (required by most tile providers). */
  attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "",
  /** Branded base-map theme. Only "dark-purple" today; default "dark-purple". */
  theme: (process.env.NEXT_PUBLIC_ZONO_MAP_THEME || "dark-purple") as ZonoMapThemeName,
} as const;

/** Dev-only OSM raster fallback (light traffic only — production must set env). */
const DEV_OSM_TILES = ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"];
const DEV_OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/** True when the dev OSM fallback is in use (no tile/style env configured). */
export const MAP_USING_DEV_FALLBACK = !MAP_ENV.styleUrl && !MAP_ENV.tileUrl;

/**
 * Build the ZONO MapLibre style. Raster OSM (env tile URL or dev fallback) with
 * a deep-purple background and a paint tint that darkens + shifts the tiles into
 * the ZONO palette — so an OSM map looks native to the dashboard, never a plain
 * OSM widget. If `NEXT_PUBLIC_MAP_STYLE_URL` is set the caller uses that instead.
 */
export function buildZonoMapStyle(): StyleSpecification {
  const tiles = MAP_ENV.tileUrl ? [MAP_ENV.tileUrl] : DEV_OSM_TILES;
  const attribution = MAP_ENV.attribution || DEV_OSM_ATTRIBUTION;
  return {
    version: 8,
    sources: {
      osm: { type: "raster", tiles, tileSize: 256, attribution, maxzoom: 19 },
    },
    layers: [
      // Deep ZONO background shows through the tinted (semi-opaque) tiles.
      { id: "zono-bg", type: "background", paint: { "background-color": MAP_BRAND.bgDeep } },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          // Darken + desaturate + shift hue toward ZONO violet (no green/yellow).
          "raster-opacity": 0.92,
          "raster-brightness-min": 0,
          "raster-brightness-max": 0.5,
          "raster-saturation": -0.12,
          "raster-contrast": 0.08,
          "raster-hue-rotate": 232,
        },
      },
    ],
  };
}

let warnedDevTiles = false;
/** One-time production warning that the OSM public tiles are dev-only. */
function warnDevTilesInProduction(): void {
  if (warnedDevTiles || process.env.NODE_ENV !== "production" || typeof console === "undefined") return;
  warnedDevTiles = true;
  console.warn("[ZonoMap] Using OSM public tiles (dev fallback). They are NOT for production traffic — set NEXT_PUBLIC_MAP_STYLE_URL (preferred) or NEXT_PUBLIC_MAP_TILE_URL to a real tile/style provider.");
}

/** Fetch an external vector style, resolve its relative asset URLs, and rebrand
 *  it into the ZONO look. Falls back to the raw URL string on any failure so a
 *  map always renders. */
async function loadBrandedVectorStyle(styleUrl: string): Promise<string | StyleSpecification> {
  try {
    const res = await fetch(styleUrl, { credentials: "omit" });
    if (!res.ok) return styleUrl;
    const base = (await res.json()) as StyleSpecification;
    const abs = (u: string) => { try { return new URL(u, styleUrl).toString(); } catch { return u; } };
    // Resolve relative sprite/glyphs against the style URL (MapLibre would do
    // this on a URL load; we do it manually because we pass an object).
    if (typeof base.sprite === "string" && !/^https?:/i.test(base.sprite)) base.sprite = abs(base.sprite);
    if (typeof base.glyphs === "string" && !/^https?:/i.test(base.glyphs) && !base.glyphs.startsWith("{")) base.glyphs = abs(base.glyphs);
    for (const src of Object.values(base.sources ?? {}) as Record<string, unknown>[]) {
      if (typeof src.url === "string" && !/^https?:/i.test(src.url) && !String(src.url).startsWith("mapbox:")) src.url = abs(src.url);
      if (Array.isArray(src.tiles)) src.tiles = (src.tiles as string[]).map((t) => (/^https?:/i.test(t) ? t : abs(t)));
    }
    return buildZonoVectorStyle(base);
  } catch {
    return styleUrl; // network/parse failure → let MapLibre load the URL as-is
  }
}

/**
 * Resolve the style ZonoMap should hand to MapLibre, honouring the env contract:
 *   • NEXT_PUBLIC_MAP_STYLE_URL → load that vector style, rebrand it (ZONO look).
 *   • NEXT_PUBLIC_MAP_TILE_URL  → raster mode with the ZONO raster tint.
 *   • neither                   → OSM raster dev fallback (+ production warning).
 */
export async function resolveZonoMapStyle(): Promise<string | StyleSpecification> {
  if (MAP_ENV.styleUrl) return loadBrandedVectorStyle(MAP_ENV.styleUrl);
  if (MAP_ENV.tileUrl) return buildZonoMapStyle();
  warnDevTilesInProduction();
  return buildZonoMapStyle();
}

/** Tone → color used by branded markers/clusters. */
export type MapTone = "brand" | "success" | "warning" | "danger";
export const TONE_COLOR: Record<MapTone, string> = {
  brand: MAP_BRAND.brand,
  success: MAP_BRAND.success,
  warning: MAP_BRAND.warning,
  danger: MAP_BRAND.danger,
};

/** A branded teardrop SVG marker (data-URI) in a ZONO tone, with soft glow. */
export function brandedMarkerSvg(tone: MapTone = "brand"): string {
  const c = TONE_COLOR[tone];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <defs>
    <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${c}" flood-opacity="0.55"/>
    </filter>
  </defs>
  <path filter="url(#g)" d="M17 1C9.3 1 3 7.2 3 14.9 3 25 17 43 17 43s14-18 14-28.1C31 7.2 24.7 1 17 1z"
        fill="${c}" stroke="#ede9fe" stroke-width="1.5"/>
  <circle cx="17" cy="15" r="5" fill="#0e0a1f" opacity="0.9"/>
  <circle cx="17" cy="15" r="2.4" fill="#ede9fe"/>
</svg>`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
