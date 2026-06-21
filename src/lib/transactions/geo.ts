/**
 * Geo neighborhood discovery — server-only.
 * Two sources, both best-effort:
 *   1) OpenStreetMap (official, free, no key) — authoritative but sparse for many
 *      Israeli cities.
 *   2) OpenAI (optional, gated by OPENAI_API_KEY) — fills the gap where OSM is
 *      empty. AI output is treated as a SUGGESTION: labeled source="openai",
 *      is_verified=false, and validated downstream by the per-neighborhood
 *      transaction scan (a name with no sold transactions simply stays empty).
 * Any failure returns []. Each neighborhood = its own 700m GovMap pull.
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

/** True when the OpenAI-backed discovery is available (key configured). */
export function isAiDiscoveryConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Ask OpenAI to list the residential neighborhoods of an Israeli city. Used only
 * as a fallback/supplement to OSM. Strict JSON output, low temperature to reduce
 * variance. Results are SUGGESTIONS (source="openai", unverified) — never treated
 * as ground truth; the GovMap transaction scan validates each one. Returns [] when
 * the key is missing or on any failure (never throws).
 */
export async function discoverNeighborhoodsAI(city: string): Promise<DiscoveredNeighborhood[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const cityName = city.trim();
  if (!cityName) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "אתה מומחה גאוגרפיה של ערים בישראל. החזר אך ורק JSON בפורמט " +
              '{"neighborhoods": ["שם שכונה", ...]} — רשימת שמות השכונות המוכרות בעיר, ' +
              "בעברית, ללא הסברים, ללא רחובות, ללא ערים שכנות. אם אינך בטוח לגבי עיר מסוימת, החזר רשימה ריקה.",
          },
          { role: "user", content: `רשום את כל השכונות בעיר "${cityName}".` },
        ],
      }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return []; }
    const list = (parsed as { neighborhoods?: unknown })?.neighborhoods;
    if (!Array.isArray(list)) return [];
    const out: DiscoveredNeighborhood[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (typeof item !== "string") continue;
      const name = item.trim();
      if (!name || name.length > 40 || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, place: "neighbourhood", lat: null, lng: null, source: "openai" });
    }
    return out;
  } catch {
    return [];
  }
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
