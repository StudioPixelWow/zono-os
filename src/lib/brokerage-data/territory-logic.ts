// ============================================================================
// 🗺️ Territory membership — PURE logic (client-safe, no server imports).
// The canonical predicate that scopes office/broker intelligence to an org's
// operating market. Kept separate from the DB resolver so it is unit-testable.
// ============================================================================
import { canonicalLocality } from "../geo/locality.ts";

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

/** Normalize a city string to its CANONICAL locality key — the ONE resolver
 *  (canonicalLocality, geo/locality.ts) shared by territory, offices, agents,
 *  discovery and scores. It folds Hebrew ktiv male/haser drift (קריית⇄קרית),
 *  final letters and quotes AND resolves Hebrew⇄English transliteration
 *  ("Kiryat Bialik" ⇒ "קרית ביאליק") so every spelling of the SAME locality
 *  compares equal — while genuinely different localities keep distinct keys
 *  (unknown names fall back to their own folded form; never a fabricated match,
 *  never substring). This closes the "English office vanished by spelling" gap. */
export function normalizeCityKey(v: string | null | undefined): string {
  return canonicalLocality(v);
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
