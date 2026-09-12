// ============================================================================
// ZONO — canonical-broker merge policy (PURE, tested). The rule the resolution
// service applies: PHONE/EMAIL are unique → merge; NAME alone never merges (the
// live data has 1,745 name+city collisions vs only 277 phone matches). A phone
// cluster carrying more than one distinct name is AMBIGUOUS, not a confident merge.
// ============================================================================
import { normalizePhoneIL, normalizeEmailAddr } from "@/lib/util/identity";

export type KeyKind = "phone" | "email" | "name";

/** Strong clustering key for a source identity, or null when name-only. */
export function strongKey(phone: string | null | undefined, email: string | null | undefined): { key: string; kind: KeyKind } | null {
  const p = normalizePhoneIL(phone);
  if (p.length >= 9) return { key: `p:${p}`, kind: "phone" };
  const e = normalizeEmailAddr(email);
  if (e) return { key: `e:${e}`, kind: "email" };
  return null;
}

export interface MergeVerdict { verification: "high" | "ambiguous" | "low"; confidence: number; merges: boolean }

/** Verdict for a cluster: a strong (phone/email) cluster with one name → high
 *  merge; with several names → ambiguous; name-only → low, standalone. */
export function mergeVerdict(kind: KeyKind, distinctNames: number): MergeVerdict {
  if (kind === "phone" || kind === "email") {
    if (distinctNames > 1) return { verification: "ambiguous", confidence: 40, merges: false };
    return { verification: "high", confidence: kind === "phone" ? 90 : 85, merges: true };
  }
  return { verification: "low", confidence: 30, merges: false }; // name-only never auto-merges
}
