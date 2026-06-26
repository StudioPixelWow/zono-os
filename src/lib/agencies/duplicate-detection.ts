// ============================================================================
// ZONO — Agency duplicate detection (Phase 26.0, PURE / client-safe).
// Returns a 0..1 confidence that two agencies are the same business, from
// normalized name similarity + hard signals (website / phone / email / place).
// Deterministic. No IO. Used by AgencyService.mergeDuplicateAgencies + dedupe.
// ============================================================================
import {
  normalizeAgencyName, normalizeEmail, normalizePhone, normalizeWebsite,
} from "./normalize";

export interface AgencyLike {
  name?: string | null;
  normalizedName?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  googlePlaceId?: string | null;
}

/** Token-set Jaccard + bigram blend on normalized names → 0..1. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeAgencyName(a);
  const nb = normalizeAgencyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union ? inter / union : 0;

  const bigrams = (s: string): Set<string> => {
    const g = new Set<string>();
    const t = s.replace(/\s/g, "");
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const ga = bigrams(na);
  const gb = bigrams(nb);
  const gi = [...ga].filter((x) => gb.has(x)).length;
  const dice = ga.size + gb.size ? (2 * gi) / (ga.size + gb.size) : 0;

  return Math.round((0.5 * jaccard + 0.5 * dice) * 100) / 100;
}

export interface DuplicateScore {
  confidence: number;            // 0..1
  reasons: string[];             // which signals matched
  hardMatch: boolean;            // an exact identity signal matched
}

/**
 * Confidence that two agencies are duplicates. Exact website/phone/email/place
 * are strong evidence; otherwise name similarity drives the score.
 */
export function duplicateScore(a: AgencyLike, b: AgencyLike): DuplicateScore {
  const reasons: string[] = [];
  let hard = false;

  const wa = normalizeWebsite(a.website), wb = normalizeWebsite(b.website);
  if (wa && wa === wb) { reasons.push("website"); hard = true; }
  const pa = normalizePhone(a.phone), pb = normalizePhone(b.phone);
  if (pa && pa === pb) { reasons.push("phone"); hard = true; }
  const ea = normalizeEmail(a.email), eb = normalizeEmail(b.email);
  if (ea && ea === eb) { reasons.push("email"); hard = true; }
  if (a.googlePlaceId && a.googlePlaceId === b.googlePlaceId) { reasons.push("google_place"); hard = true; }

  const nameSim = nameSimilarity(a.normalizedName ?? a.name, b.normalizedName ?? b.name);
  if (nameSim >= 0.6) reasons.push("name");

  // A hard signal alone → very high; name corroborates. Otherwise name-only.
  let confidence = hard ? Math.max(0.9, nameSim) : nameSim;
  if (hard && nameSim >= 0.6) confidence = Math.min(1, confidence + 0.05);
  confidence = Math.round(confidence * 100) / 100;

  return { confidence, reasons, hardMatch: hard };
}

/** Default threshold above which two agencies are treated as the same. */
export const DUPLICATE_THRESHOLD = 0.82;

export function isLikelyDuplicate(a: AgencyLike, b: AgencyLike, threshold = DUPLICATE_THRESHOLD): boolean {
  return duplicateScore(a, b).confidence >= threshold;
}
