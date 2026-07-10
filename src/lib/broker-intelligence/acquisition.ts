// ============================================================================
// 🎯 ZONO — BROKER INTELLIGENCE · Area 1 · Acquisition (PURE).
// Ranks an external property by acquisition probability from REAL signals only
// (external_listings + duplicates + market + matching). Emits the shared
// evidence-based Recommendation contract. Every point of confidence traces to a
// real evidence line; when signals are too thin it flags insufficientEvidence
// and never invents a strong claim. No LLM, no fabrication, fully offline-testable.
// ============================================================================
import {
  type Recommendation, type Evidence, clamp100, urgencyFromScore, MIN_EVIDENCE,
} from "./types";

/** REAL, already-computed signals for one external listing (from the
 *  external-listings service / deal.ts). Every field maps to a real column or
 *  a real aggregate — nothing here is invented. Nullable = "not known". */
export interface AcquisitionSignals {
  listingId: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  /** Days the listing has been live (from first_seen_at). Null = unknown. */
  daysOnMarket: number | null;
  /** Count of observed price reductions (external_listing_history). */
  priceReductions: number;
  /** Private owner (no broker/agency) — the acquisition prize. */
  privateOwner: boolean;
  /** Suspected duplicate of another listing (external_listing_duplicates). */
  duplicate: boolean;
  /** % vs the neighborhood average price (negative = below market). Null=unknown. */
  vsNeighborhoodPct: number | null;
  /** Active buyers in the CRM that match this listing (matching engine). */
  buyerMatches: number;
  /** Competing active listings nearby (market). Null = unknown. */
  competingCount: number | null;
  /** 0..100 likelihood the owner will sell / list (if the model has produced one). */
  sellerLikelihood: number | null;
}

const loc = (s: AcquisitionSignals) =>
  [s.neighborhood, s.city].filter(Boolean).join(", ") || "מיקום לא ידוע";

/**
 * Score + explain one acquisition opportunity. Pure + deterministic.
 * Confidence is driven by how many independent real signals corroborate it.
 */
export function scoreAcquisition(s: AcquisitionSignals): Recommendation {
  const evidence: Evidence[] = [];
  let score = 0;

  // Private owner — strongest acquisition driver (win the seller side directly).
  if (s.privateOwner) {
    score += 26;
    evidence.push({ label: "מודעת בעלים פרטי — הזדמנות גיוס בלעדיות", source: "external_listings", weight: 26 });
  }

  // Price reductions — motivation signal.
  if (s.priceReductions >= 2) {
    score += 18;
    evidence.push({ label: `המחיר ירד ${s.priceReductions} פעמים — מוטיבציית מכירה`, source: "external_listings", weight: 18 });
  } else if (s.priceReductions === 1) {
    score += 9;
    evidence.push({ label: "ירידת מחיר אחת לאחרונה", source: "external_listings", weight: 9 });
  }

  // Time on market — stale = owner more open to representation.
  if (s.daysOnMarket != null && s.daysOnMarket >= 90) {
    score += 16;
    evidence.push({ label: `${s.daysOnMarket} יום בשוק — מודעה תקועה`, source: "external_listings", weight: 16 });
  } else if (s.daysOnMarket != null && s.daysOnMarket >= 45) {
    score += 8;
    evidence.push({ label: `${s.daysOnMarket} יום בשוק`, source: "external_listings", weight: 8 });
  }

  // Priced below the neighborhood — attractive to close.
  if (s.vsNeighborhoodPct != null && s.vsNeighborhoodPct <= -5) {
    score += 12;
    evidence.push({ label: `${Math.abs(s.vsNeighborhoodPct)}% מתחת לממוצע השכונה`, source: "market", weight: 12 });
  }

  // Ready buyers — a live lever for the acquisition call.
  if (s.buyerMatches > 0) {
    score += Math.min(16, 6 + s.buyerMatches * 2);
    evidence.push({ label: `${s.buyerMatches} קונים פעילים תואמים כבר במאגר`, source: "matching", weight: Math.min(16, 6 + s.buyerMatches * 2) });
  }

  // Thin competition — easier to stand out.
  if (s.competingCount != null && s.competingCount <= 2) {
    score += 6;
    evidence.push({ label: "מעט מודעות מתחרות באזור", source: "market", weight: 6 });
  }

  // Model-produced seller likelihood, when present.
  if (s.sellerLikelihood != null && s.sellerLikelihood >= 60) {
    score += 8;
    evidence.push({ label: `סבירות מכירה מוערכת ${s.sellerLikelihood}%`, source: "crm", weight: 8 });
  }

  // Duplicate — a caution, not a driver (lowers confidence in the signal set).
  if (s.duplicate) {
    evidence.push({ label: "חשד לכפילות מול מודעה אחרת — לאמת לפני פנייה", source: "external_listings" });
  }

  const confidence = clamp100(score);
  // Corroborating evidence = the scored (weighted) lines, excluding pure cautions.
  const scoredEvidence = evidence.filter((e) => (e.weight ?? 0) > 0).length;
  const insufficient = scoredEvidence < MIN_EVIDENCE;

  const why = insufficient
    ? "אין מספיק אותות אמת כדי לדרג את ההזדמנות בביטחון — למעקב בלבד."
    : evidence.filter((e) => (e.weight ?? 0) > 0).slice(0, 3).map((e) => e.label).join(" · ");

  const suggestedAction = insufficient
    ? "השאר במעקב; הרץ סריקה חוזרת כשיצטברו נתונים."
    : s.privateOwner
      ? "התקשר לבעלים, הצג ערך (חשיפה + קונים תואמים) והצע ייצוג/בלעדיות."
      : "פנה לבדיקת שיתוף פעולה או התאמת קונה; אין לפרסם כבלעדיות המשרד.";

  const expectedImpact = insufficient
    ? "לא ניתן להעריך — אין די ראיות."
    : s.privateOwner
      ? `גיוס בלעדיות פוטנציאלי${s.buyerMatches > 0 ? ` + ${s.buyerMatches} קונים ממתינים` : ""}.`
      : "פוטנציאל שיתוף פעולה / חיבור קונה.";

  return {
    id: `acq_${s.listingId}`,
    area: "acquisition",
    entityType: "external_listing",
    entityId: s.listingId,
    title: s.privateOwner ? `הזדמנות גיוס: בעלים פרטי · ${loc(s)}` : `נכס למעקב · ${loc(s)}`,
    why,
    evidence,
    confidence,
    urgency: urgencyFromScore(confidence),
    expectedImpact,
    suggestedAction,
    href: `/external-listings/${s.listingId}`,
    insufficientEvidence: insufficient,
  };
}

/** Rank many opportunities — highest confidence first; insufficient-evidence
 *  items sink to the bottom (honest, never hidden). */
export function rankAcquisition(list: AcquisitionSignals[]): Recommendation[] {
  return list
    .map(scoreAcquisition)
    .sort((a, b) => {
      if (a.insufficientEvidence !== b.insufficientEvidence) return a.insufficientEvidence ? 1 : -1;
      return b.confidence - a.confidence;
    });
}
