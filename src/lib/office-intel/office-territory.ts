// ============================================================================
// ZONO — Office Intelligence TERRITORY scoping (pure, dependency-free, tested).
// P0: the office universe must be the CURRENT org's territory, never the global
// detected-office graph. An office is in-territory when its city matches one of
// the org's specialization areas (canonical territory_profiles), OR the org has
// its OWN observed activity linked to it (a linked listing ⇒ it operates in the
// org's market). Loose city match (both-way contains, normalized) tolerates the
// "קריית ביאליק"/"קרית ביאליק" spelling drift. Shared graph, org-scoped presentation.
// ============================================================================

// Normalize for loose city matching: strip punctuation, collapse whitespace, and
// fold Hebrew male/haser spelling drift (doubled yod/vav → single) so
// "קריית ביאליק" and "קרית ביאליק" compare equal.
const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase().replace(/["'’`.]/g, "").replace(/\s+/g, " ").replace(/י{2,}/g, "י").replace(/ו{2,}/g, "ו");

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

/** Loose membership of a place in the territory area set (both-way contains). */
export function cityInTerritory(city: string | null | undefined, areas: string[]): boolean {
  const c = norm(city);
  if (!c) return false;
  for (const a of areas) {
    const n = norm(a);
    if (!n) continue;
    if (c === n || c.includes(n) || n.includes(c)) return true;
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
