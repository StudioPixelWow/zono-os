// ============================================================================
// 🗺️ Territory membership — PURE logic (client-safe, no server imports).
// The canonical predicate that scopes office/broker intelligence to an org's
// operating market. Kept separate from the DB resolver so it is unit-testable.
// ============================================================================

export interface OrgTerritory {
  orgId: string;
  /** Normalized city keys to match observed data against (lowercased/trimmed). */
  cityKeys: Set<string>;
  /** Human-readable canonical names (for labels/debug). */
  canonicalNames: string[];
  localityIds: string[];
  /** True when the org has no resolvable territory (nothing should be shown). */
  empty: boolean;
}

/** Normalize a city string for cross-source matching (script-preserving — never
 *  collapses different-language names of DIFFERENT cities, only casing/space). */
export function normalizeCityKey(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Canonical territory-membership predicate (pure). An office is in an org's
 * territory when the org has OBSERVED it through its own listings (org bridge) OR
 * its canonical city is one of the org's operating cities. A globally-known office
 * in an unrelated city is NEVER in territory just because it exists. When the org
 * has no resolvable territory AND no bridge evidence, nothing is in territory
 * (UNKNOWN ≠ everything).
 */
export function officeInTerritory(
  office: { id: string; city: string | null },
  cityKeys: Set<string>,
  orgOfficeIds: Set<string>,
): boolean {
  if (office.id && orgOfficeIds.has(office.id)) return true;
  if (cityKeys.size === 0) return false;
  return cityKeys.has(normalizeCityKey(office.city));
}
