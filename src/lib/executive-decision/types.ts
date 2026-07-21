// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.8 · EXECUTIVE DECISION ENGINE — types.
//
// The Decision Engine is a PRIORITIZATION LAYER, nothing more. It is NOT an
// analytics engine, NOT a coach, NOT a recommendation engine, NOT a KPI
// system. Given canonical evidence that already exists, it names the (at most
// three) decisions that deserve executive attention right now.
// ============================================================================

/** Business domains the engine may label — existing facts only, never new. */
export type DecisionCategory =
  | "Journey" | "Pipeline" | "Opportunities" | "Market" | "Matching"
  | "Competition" | "Office" | "Performance" | "Coverage" | "Data Quality" | "Automation";

export type DecisionAudience = "manager" | "broker" | "member";

/** A traceable evidence reference — every decision sentence points at these. */
export interface DecisionEvidenceRef {
  label: string;                 // verbatim from the canonical provider
  source: string;                // journeys / broker-intelligence queue / journey-coach / projection
  recommendationId?: string;     // when the ref is a canonical queue recommendation
  journeyId?: string;            // when the ref is a canonical journey
}

/** An entity a decision touches — carried from upstream, never resolved anew. */
export interface DecisionEntity {
  entityType: string;
  entityId: string;
  title: string;
  href: string | null;
}

/**
 * One executive decision. Everything here is INHERITED from canonical
 * providers: priority is the ordinal rank (1..3) plus the upstream priority
 * number when one exists; confidence is upstream-or-null, never computed.
 */
export interface ExecutiveDecision {
  id: string;                    // deterministic: derived from the upstream identity
  category: DecisionCategory;
  /** Ordinal rank in this answer: 1 = most important. Never a new score. */
  priority: number;
  /** The upstream priority number this rank was derived from (null = none). */
  upstreamPriority: number | null;
  headline: string;
  summary: string;
  whyNow: string;
  recommendedAction: string;     // an EXISTING action (queue/coach) — never invented
  expectedImpact: string;
  evidence: DecisionEvidenceRef[];
  affectedEntities: DecisionEntity[];
  /** Inherited only. null when no upstream confidence exists. */
  confidence: number | null;
  links: string[];
}

export interface ExecutiveDecisions {
  decisions: ExecutiveDecision[];        // 1..3, never more
  /** TRUE when the single decision is the honest "no action required". */
  noActionRequired: boolean;
  audience: DecisionAudience;
  /** Where the inputs came from — auditability, not marketing. */
  basis: string[];
}

/** Structural view of a canonical Broker Intelligence queue item (verbatim). */
export interface DecisionQueueItem {
  id: string;
  area: string;                  // acquisition | buyer | seller | deal | daily | office | journey
  entityType: string;
  entityId: string;
  title: string;
  why: string;
  suggestedAction: string;
  expectedImpact: string;
  confidence: number;
  priority: number;
  urgency: string;
  href: string | null;
  evidence: { label: string; source: string }[];
  insufficientEvidence: boolean;
}
