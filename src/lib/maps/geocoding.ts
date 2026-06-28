// ============================================================================
// ZONO — Geocoding service (server-only).
// ----------------------------------------------------------------------------
// Turns an address into real coordinates via the Google Geocoding API. HARD RULES:
//   • NEVER invents coordinates. On any failure → returns null (caller stores
//     nothing and the UI shows an honest empty state).
//   • Uses a SERVER-side key (GOOGLE_MAPS_GEOCODE_API_KEY), falling back to the
//     public maps key only if a server key is not set. The key is never returned
//     to the client.
//   • Caller is responsible for PERSISTING the result (lat/lng/geocoded_at/...)
//     so we do NOT geocode on every render.
// ============================================================================
import "server-only";

export type GeocodeProvider = "google" | "nominatim";

export interface GeocodeInput {
  address?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  /** Country bias; defaults to Israel. */
  region?: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  provider: GeocodeProvider;
  /** 0..1 — derived from Google's location_type (ROOFTOP = highest). */
  confidence: number;
}

export type GeocodeOutcome =
  | { ok: true; result: GeocodeResult }
  | { ok: false; reason: "no_query" | "not_found" | "config" | "denied" | "error"; message: string };

function geocodeKey(): string | null {
  const k = process.env.GOOGLE_MAPS_GEOCODE_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

/** Non-sensitive fingerprint of the key the SERVER actually resolves — for the
 *  admin diagnostic. Never returns the full key (prefix/suffix only). */
export interface GeocodeKeyInfo {
  source: "geocode" | "public" | "none";
  present: boolean;
  length: number;
  prefix: string;          // first 4 chars (valid Google keys start with "AIza")
  suffix: string;          // last 4 chars — enough to compare, not to reconstruct
  startsWithAIza: boolean;
  /** True if the trimmed value differs from the raw env (hidden whitespace). */
  hadWhitespace: boolean;
}
export function geocodeKeyInfo(): GeocodeKeyInfo {
  const rawGeo = process.env.GOOGLE_MAPS_GEOCODE_API_KEY ?? "";
  const rawPub = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const geo = rawGeo.trim();
  const pub = rawPub.trim();
  const usingGeo = geo.length > 0;
  const key = usingGeo ? geo : (pub.length > 0 ? pub : "");
  const raw = usingGeo ? rawGeo : rawPub;
  const source: GeocodeKeyInfo["source"] = usingGeo ? "geocode" : pub.length > 0 ? "public" : "none";
  if (!key) return { source: "none", present: false, length: 0, prefix: "", suffix: "", startsWithAIza: false, hadWhitespace: false };
  return {
    source, present: true, length: key.length,
    prefix: key.slice(0, 4), suffix: key.slice(-4),
    startsWithAIza: key.startsWith("AIza"),
    hadWhitespace: raw.length !== key.length,
  };
}

/** Build a single address query string from structured parts (Israeli-friendly). */
export function buildQuery(input: GeocodeInput): string {
  const streetPart = [input.street, input.streetNumber].filter(Boolean).join(" ");
  const parts = [input.address || streetPart, input.neighborhood, input.city]
    .map((s) => (s ?? "").trim().replace(/\s+/g, " ")) // collapse whitespace
    .filter(Boolean)
    // de-dupe consecutive identical parts (address often already contains city)
    .filter((s, i, arr) => i === 0 || s !== arr[i - 1]);
  if (parts.length === 0) return "";
  // Israeli formatting: append the country once (improves hit-rate; region=il also set).
  const joined = parts.join(", ");
  return /ישראל|israel/i.test(joined) ? joined : `${joined}, ישראל`;
}

const CONFIDENCE: Record<string, number> = {
  ROOFTOP: 1, RANGE_INTERPOLATED: 0.8, GEOMETRIC_CENTER: 0.6, APPROXIMATE: 0.4,
};

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
  }>;
  error_message?: string;
}

// ── OSM Nominatim fallback (keyless) ────────────────────────────────────────
// Used automatically when no Google key is configured (the default after the OSM
// migration), so external listings still get REAL coordinates from their address.
// Nominatim's usage policy caps requests at ~1/sec → we throttle globally.
let lastNominatimAt = 0;
async function geocodeViaNominatim(query: string, region: string): Promise<GeocodeOutcome> {
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    format: "json", limit: "1", countrycodes: region || "il", "accept-language": "he", q: query,
  }).toString();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ZONO-RealEstate/1.0 (maps)", "Accept-Language": "he" } });
    if (!res.ok) return { ok: false, reason: "error", message: `Nominatim ${res.status}` };
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string; importance?: number }>;
    if (!data.length) return { ok: false, reason: "not_found", message: "לא נמצאו תוצאות לכתובת (OSM)." };
    const lat = Number(data[0].lat), lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "error", message: "תוצאת OSM לא תקינה." };
    const imp = typeof data[0].importance === "number" ? data[0].importance : 0.4;
    return { ok: true, result: { lat, lng, formattedAddress: data[0].display_name ?? query, provider: "nominatim", confidence: Math.max(0.4, Math.min(0.9, imp)) } };
  } catch {
    return { ok: false, reason: "error", message: "שגיאת רשת בגאוקודינג (OSM)." };
  }
}

/** Geocode one address. Tries Google when a key is configured, otherwise (or on
 *  a denied/config Google error) falls back to keyless OSM Nominatim — so every
 *  scraped listing can get REAL coordinates. Returns ok:false on any failure;
 *  NEVER invents coordinates. */
export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeOutcome> {
  const query = buildQuery(input);
  if (!query) return { ok: false, reason: "no_query", message: "אין כתובת לגאוקודינג." };
  const key = geocodeKey();

  // No Google key → go straight to the keyless OSM fallback.
  if (!key) return geocodeViaNominatim(query, input.region ?? "il");

  const url = "https://maps.googleapis.com/maps/api/geocode/json?" + new URLSearchParams({
    address: query, region: input.region ?? "il", language: "iw", key,
  }).toString();

  let json: GoogleGeocodeResponse;
  try {
    const res = await fetch(url, { method: "GET" });
    json = (await res.json()) as GoogleGeocodeResponse;
  } catch {
    return geocodeViaNominatim(query, input.region ?? "il"); // network error → OSM
  }

  if (json.status === "OK" && json.results && json.results[0]) {
    const r = json.results[0];
    const loc = r.geometry?.location;
    if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
      return {
        ok: true,
        result: {
          lat: loc.lat, lng: loc.lng,
          formattedAddress: r.formatted_address ?? query,
          provider: "google",
          confidence: CONFIDENCE[r.geometry?.location_type ?? "APPROXIMATE"] ?? 0.4,
        },
      };
    }
  }
  if (json.status === "ZERO_RESULTS") return { ok: false, reason: "not_found", message: "לא נמצאו תוצאות לכתובת." };
  // A rejected/blocked Google key shouldn't kill the pipeline → fall back to OSM.
  if (json.status === "REQUEST_DENIED" || json.status === "OVER_QUERY_LIMIT") return geocodeViaNominatim(query, input.region ?? "il");
  return { ok: false, reason: "error", message: json.error_message ?? `שגיאת גאוקודינג (${json.status}).` };
}

export interface BatchGeocodeStats { success: number; failed: number; skipped: number; lowConfidence: number }

/**
 * Geocode a batch of entities that lack coordinates. The `persist` callback
 * stores the result (or marks the failure) so we never re-geocode on render.
 * `lowConfidenceThreshold` flags weak matches without dropping them.
 */
export async function geocodeBatch<T extends { id: string }>(
  rows: T[],
  toInput: (row: T) => GeocodeInput,
  persist: (row: T, result: GeocodeResult) => Promise<void>,
  opts: { lowConfidenceThreshold?: number; delayMs?: number } = {},
): Promise<BatchGeocodeStats> {
  const stats: BatchGeocodeStats = { success: 0, failed: 0, skipped: 0, lowConfidence: 0 };
  const threshold = opts.lowConfidenceThreshold ?? 0.5;
  for (const row of rows) {
    const input = toInput(row);
    if (!buildQuery(input)) { stats.skipped++; continue; }
    const out = await geocodeAddress(input);
    if (!out.ok) { stats.failed++; continue; }
    if (out.result.confidence < threshold) stats.lowConfidence++;
    try { await persist(row, out.result); stats.success++; }
    catch { stats.failed++; }
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  return stats;
}
