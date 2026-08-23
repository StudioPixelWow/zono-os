// ============================================================================
// ZONO — Office Intelligence TERRITORY scoping (pure, dependency-free, tested).
// P0: the office universe must be the CURRENT org's territory, never the global
// detected-office graph. An office is in-territory when its city matches one of
// the org's specialization areas (canonical territory), OR the org has its OWN
// observed activity linked to it. Matching uses the ONE canonical locality
// resolver (canonicalLocality) so קרית ביאליק == קריית ביאליק == "Kiryat Bialik"
// — EQUALITY of canonical keys only, never substring. Shared graph, org-scoped view.
// ============================================================================
import { canonicalLocality } from "../geo/locality.ts";

// Canonical locality key — the single shared resolver (Hebrew ktiv male/haser,
// finals, quotes, AND Hebrew⇄English transliteration). Same-locality variants
// collapse; different localities stay distinct (no fabricated match, no substring).
const norm = (s: string | null | undefined): string => canonicalLocality(s);

/** Distinct, non-empty specialization area names from the org's territory_profiles. */
export function deriveTerritoryAreas(rows: { city_name?: string | null; neighborhood_name?: string | null }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    for (const name of [r.city_name, r.neighborhood_name]) {
      const v = (name ?? "").trim();
      if (!v) continue;
      const k = norm(v);
      if (!seen.has(k)) { seen.add(k); out.push(v); }
    }
  }
  return out;
}

/** STRICT membership of a place in the territory area set. Equality only, AFTER
 *  male/haser spelling folding (so קריית ביאליק == קרית ביאליק) — but NEVER
 *  substring containment. Substring matching leaked unrelated cities (a short
 *  area/neighborhood token substring-matched offices in other cities), which is
 *  the P0 cross-territory bug. Exact-with-fold keeps spelling drift tolerant
 *  without ever admitting a different city. */
export function cityInTerritory(city: string | null | undefined, areas: string[]): boolean {
  const c = norm(city);
  if (!c) return false;
  for (const a of areas) {
    const n = norm(a);
    if (!n) continue;
    if (c === n) return true;
  }
  return false;
}

/** An office belongs to the org's territory view. `hasOrgActivity` = the org has a
 *  listing linked to this office (⇒ it operates in the org's observed market). */
export function officeInTerritory(
  office: { city: string | null; observedAreas?: (string | null)[] },
  areas: string[],
  hasOrgActivity: boolean,
): boolean {
  if (hasOrgActivity) return true;                 // org's own observed evidence
  if (areas.length === 0) return false;            // no territory config ⇒ activity-only (see selector fallback)
  if (cityInTerritory(office.city, areas)) return true;
  for (const a of office.observedAreas ?? []) if (cityInTerritory(a, areas)) return true;
  return false;
}
