// ============================================================================
// 🧠 ZONO — BROKER INTELLIGENCE · shared recommendation contract (PURE).
// The single evidence-based shape EVERY intelligence area emits (acquisition,
// buyer, seller, deal, daily mission, office). NON-NEGOTIABLE: no fabrication.
// A recommendation MUST carry why + evidence + confidence + expected impact +
// suggested action + data source. When the evidence is too thin, the engine
// says so honestly (insufficientEvidence=true) instead of guessing.
// ============================================================================

export type IntelligenceArea =
  | "acquisition" | "buyer" | "seller" | "deal" | "daily" | "office"
  // Batch 5.6E — the canonical Journey spine as a first-class intelligence area.
  | "journey";

/** How urgent / valuable — drives ranking and surfacing. */
export type Urgency = "critical" | "high" | "medium" | "low";

/** One piece of REAL evidence behind a recommendation (traceable to a source). */
export interface Evidence {
  /** Human, Hebrew fact ("המחיר ירד 3 פעמים"). */
  label: string;
  /** Where it came from — a real table/module, never "AI". */
  source: DataSource;
  /** Optional numeric weight this signal contributed to the score (0..100). */
  weight?: number;
}

/** Traceable origins — every evidence line names one. */
export type DataSource =
  | "external_listings" | "crm" | "matching" | "market" | "timeline"
  | "marketing" | "activity" | "deals" | "documents" | "meetings" | "journeys";

/** The universal, evidence-based recommendation. */
export interface Recommendation {
  id: string;
  area: IntelligenceArea;
  /** The entity this is about (buyer/seller/deal/property/external_listing id). */
  entityType: string;
  entityId: string;
  /** One-line human title ("הזדמנות גיוס: בעלים פרטי בכרמל"). */
  title: string;
  /** WHY it matters — short, human, no jargon. */
  why: string;
  /** REAL evidence lines (each with its source). */
  evidence: Evidence[];
  /** 0..100 — driven by how much corroborating real evidence exists. */
  confidence: number;
  urgency: Urgency;
  /** Expected business impact, human ("גיוס בלעדיות + 3 קונים ממתינים"). */
  expectedImpact: string;
  /** The concrete next action the broker should take. */
  suggestedAction: string;
  /** Optional deep-link to act on it. */
  href: string | null;
  /** TRUE when the engine lacks enough evidence to recommend confidently. */
  insufficientEvidence: boolean;
}

/** Clamp any score to the 0..100 band. */
export function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map a 0..100 score to an urgency band (shared across areas). */
export function urgencyFromScore(score: number): Urgency {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** The minimum real evidence a confident recommendation needs. Below this, the
 *  engine flags insufficientEvidence and never fabricates a strong claim. */
export const MIN_EVIDENCE = 2;
