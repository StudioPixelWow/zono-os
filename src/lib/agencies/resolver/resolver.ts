// ============================================================================
// ZONO — Agency Identity Resolver (Phase 26.1, PURE / client-safe).
// Ranks an org's known agencies against raw text using normalized-name
// similarity + alias hits + hard contact signals. Deterministic. No IO.
// ============================================================================
import { normalizeAgencyName } from "../normalize";
import { duplicateScore, nameSimilarity, type AgencyLike } from "../duplicate-detection";
import type { AgencyMatch, CandidateStatus, KnownAgency, ResolutionResult } from "./types";

/** Confidence at/above which raw text is treated as the SAME known agency. */
export const RESOLVE_ACCEPT = 0.82;
/** Confidence band that warrants human review rather than auto-accept. */
export const RESOLVE_REVIEW = 0.6;

/** Score one known agency against the raw text → 0..1 + reasons. */
function scoreAgency(rawText: string, normalized: string, a: KnownAgency): AgencyMatch {
  const reasons: string[] = [];

  // Aliases are the strongest name signal — score continuously, not gated.
  let aliasHit = 0;
  for (const al of a.aliases ?? []) {
    if (!al) continue;
    if (al === normalized) { aliasHit = 1; break; }
    aliasHit = Math.max(aliasHit, nameSimilarity(al, normalized));
  }
  if (aliasHit >= 0.99) reasons.push("alias_exact");
  else if (aliasHit >= 0.6) reasons.push("alias_near");

  // Name + hard contact signals via the shared duplicate scorer (rawText carries
  // contacts only if present; here it's text-only, so this is mostly name-based).
  const dup = duplicateScore({ name: rawText, normalizedName: normalized } as AgencyLike,
    { name: a.name, normalizedName: a.normalizedName, website: a.website, phone: a.phone, email: a.email, googlePlaceId: a.googlePlaceId });
  if (dup.reasons.includes("name")) reasons.push("name");

  const confidence = Math.round(Math.max(aliasHit, dup.confidence) * 100) / 100;
  return { agencyId: a.id, name: a.name, confidence, reasons: [...new Set(reasons)] };
}

/**
 * Rank all known agencies against the raw text. Returns matches sorted by
 * confidence (desc), plus the suggested candidate status.
 */
export function resolveAgencyText(rawText: string, known: KnownAgency[]): ResolutionResult {
  const normalized = normalizeAgencyName(rawText);
  const candidates = known
    .map((a) => scoreAgency(rawText, normalized, a))
    .filter((m) => m.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const best = candidates[0] ?? null;
  let status: CandidateStatus = "pending";
  if (best && best.confidence >= RESOLVE_ACCEPT) status = "accepted";
  else if (best && best.confidence >= RESOLVE_REVIEW) status = "needs_review";

  return { rawText, normalizedName: normalized, bestMatch: best && best.confidence >= RESOLVE_REVIEW ? best : null, candidates, status };
}
