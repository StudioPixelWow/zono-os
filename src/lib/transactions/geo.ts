/**
 * Geo neighborhood discovery — DETERMINISTIC, server-only, NO LLM.
 * Pulls a city's neighborhoods from OpenStreetMap (official, free, no key) so
 * the GovMap scan can cover the whole city (each neighborhood = its own 700m
 * pull). Defensive: any failure returns []. This is the first concrete piece of
 * the ZONO Geo Intelligence Layer — a real source of truth, never invented.
 */
import "server-only";
import { normalizeNeighborhoodName } from "./engine";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "ZONO-RealEstate/1.0 (neighborhood geo discovery)";

export interface DiscoveredNeighborhood { name: string; lat: number | null; lng: number | null; place: string; source: string }

const esc = (s: string) => s.replace(/["\\]/g, "");

/**
 * Query OSM for place=suburb|neighbourhood|quarter inside the city's admin area.
 * Matches both common spellings (קרית / קריית). Returns [] on any failure.
 */
export async function discoverNeighborhoodsOSM(city: string): Promise<DiscoveredNeighborhood[]> {
  const c = esc(city.trim());
  const cAlt = c.replace(/קרית/g, "קריית");
  const namePred = c === cAlt ? `"name"="${c}"` : `"name"~"^(${c}|${cAlt})$"`;
  const query = `[out:json][timeout:25];
area[${namePred}]["boundary"="administrative"]->.a;
(
  node["place"~"^(suburb|neighbourhood|quarter)$"](area.a);
  way["place"~"^(suburb|neighbourhood|quarter)$"](area.a);
);
out tags center 300;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8", "User-Agent": USER_AGENT },
        body: query,
        signal: AbortSignal.timeout(28_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }[] };
      const out: DiscoveredNeighborhood[] = [];
      const seen = new Set<string>();
      for (const el of data.elements ?? []) {
        const name = el.tags?.["name:he"] ?? el.tags?.name;
        if (!name) continue;
        const key = name.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: key, place: el.tags?.place ?? "", lat: el.lat ?? el.center?.lat ?? null, lng: el.lon ?? el.center?.lon ?? null, source: "osm" });
      }
      if (out.length) return out;
    } catch { /* try next endpoint */ }
  }
  return [];
}

/** Normalize + dedup a discovered set into clean unique neighborhood names. */
export function dedupeDiscovered(items: DiscoveredNeighborhood[]): DiscoveredNeighborhood[] {
  const byKey = new Map<string, DiscoveredNeighborhood>();
  for (const it of items) {
    const norm = normalizeNeighborhoodName(it.name);
    if (!norm) continue;
    if (!byKey.has(norm)) byKey.set(norm, { ...it, name: norm });
  }
  return [...byKey.values()];
}
