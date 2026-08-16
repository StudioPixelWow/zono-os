// ============================================================================
// ZONO — Claim My Listings: PURE claim-write helpers (P10A). No DB.
// The write side of claiming, kept deterministic and unit-testable:
//   • assertClaimAllowed — enforce §9 confirmation semantics server-side.
//   • mapListingImagesToMedia — external images → property_media rows (idempotent
//     by design: the service skips import when media already exists).
//   • buildClaimReviewRecord — the broker_match_reviews decision row.
// The service layer (claim-write-service.ts) only wires these to Supabase +
// the canonical promote path. No client-supplied owner/org authority anywhere.
// ============================================================================
import type { EvidenceVerdict } from "./claim-evidence-core";

// ── §9: what may be written, and when a human must confirm ───────────────────
export interface ClaimGate {
  allowed: boolean;
  requiresConfirmation: boolean; // LOW / office-only / contradiction → explicit human OK
  reason: string;
}

/**
 * Server-authoritative gate. A claim WRITE is only permitted when:
 *   • the candidate is not cross-org excluded, AND
 *   • it is HIGH/MEDIUM (auto-eligible), OR it is LOW/office-only/contradiction
 *     AND the human explicitly confirmed (confirmLowConfidence).
 * Uncertainty never becomes certainty on its own — the caller must own it.
 */
export function assertClaimAllowed(
  verdict: EvidenceVerdict,
  opts: { confirmLowConfidence?: boolean } = {},
): ClaimGate {
  if (verdict.excluded || verdict.confidence == null) {
    return { allowed: false, requiresConfirmation: false, reason: "excluded_cross_org_or_not_candidate" };
  }
  const hasContradiction = verdict.cautions.some((c) => c.includes("טלפון") && c.includes("שונה"));
  const weak = verdict.confidence === "low" || verdict.officeLevelOnly || hasContradiction;
  if (!weak) {
    return { allowed: true, requiresConfirmation: false, reason: `auto_eligible_${verdict.confidence}` };
  }
  if (opts.confirmLowConfidence) {
    return { allowed: true, requiresConfirmation: true, reason: "human_confirmed_low_confidence" };
  }
  return { allowed: false, requiresConfirmation: true, reason: "needs_human_confirmation_low_confidence" };
}

// ── Media import mapping (external_listings.images → property_media) ──────────
export interface PropertyMediaInsert {
  org_id: string;
  property_id: string;
  type: "image";
  url: string;
  external_url: string;
  sort_order: number;
  is_primary: boolean;
  alt_text: string | null;
}

/** Extract a URL string from an image entry (portals store either a bare URL
 *  string or an object with a `url`). Returns null for anything unusable. */
export function imageUrl(entry: unknown): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  if (entry && typeof entry === "object") {
    const u = (entry as Record<string, unknown>).url ?? (entry as Record<string, unknown>).src;
    if (typeof u === "string") return u.trim() || null;
  }
  return null;
}

/**
 * Map an external listing's images to property_media insert rows. Real photos
 * only — NO AI/hallucinated imagery. De-duplicates identical URLs, marks the
 * first as primary, preserves order. Never imports more than `cap` images.
 */
export function mapListingImagesToMedia(
  orgId: string,
  propertyId: string,
  images: unknown,
  altText: string | null = null,
  cap = 30,
): PropertyMediaInsert[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const rows: PropertyMediaInsert[] = [];
  for (const entry of images) {
    const url = imageUrl(entry);
    if (!url || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url)) continue; // never trust non-http junk
    seen.add(url);
    rows.push({
      org_id: orgId, property_id: propertyId, type: "image",
      url, external_url: url, sort_order: rows.length, is_primary: rows.length === 0,
      alt_text: altText,
    });
    if (rows.length >= cap) break;
  }
  return rows;
}

// ── Decision persistence (broker_match_reviews) ──────────────────────────────
export type ClaimReviewStatus = "pending" | "approved" | "rejected" | "merged";

export interface ClaimReviewInsert {
  org_id: string;
  listing_id: string;
  broker_id: string | null;
  confidence_score: number;      // smallint 0..100
  evidence: Record<string, unknown>;
  status: ClaimReviewStatus;
  decided_by: string | null;
  decided_at: string | null;     // ISO — set when a terminal decision is made
}

const CONFIDENCE_SCORE: Record<string, number> = { high: 90, medium: 65, low: 30 };

/** Build the broker_match_reviews row that records a claim decision. Reuses the
 *  existing review table (no new table). `status` maps the claim outcome:
 *  approved = claimed, rejected = not mine, pending = snoozed/left for review. */
export function buildClaimReviewRecord(input: {
  orgId: string;
  listingId: string;
  brokerId: string | null;
  verdict: EvidenceVerdict;
  outcome: "claimed" | "rejected" | "snoozed";
  decidedBy: string | null;
  decidedAtIso: string | null;
  gate: ClaimGate;
}): ClaimReviewInsert {
  const status: ClaimReviewStatus =
    input.outcome === "claimed" ? "approved" : input.outcome === "rejected" ? "rejected" : "pending";
  const terminal = input.outcome !== "snoozed";
  return {
    org_id: input.orgId,
    listing_id: input.listingId,
    broker_id: input.brokerId,
    confidence_score: CONFIDENCE_SCORE[input.verdict.confidence ?? "low"] ?? 30,
    evidence: {
      confidence: input.verdict.confidence,
      reasons: input.verdict.reasons,
      cautions: input.verdict.cautions,
      officeLevelOnly: input.verdict.officeLevelOnly,
      gate: { requiresConfirmation: input.gate.requiresConfirmation, reason: input.gate.reason },
      outcome: input.outcome,
    },
    status,
    decided_by: terminal ? input.decidedBy : null,
    decided_at: terminal ? input.decidedAtIso : null,
  };
}
