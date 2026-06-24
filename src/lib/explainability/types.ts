// ============================================================================
// ZONO — Universal Explainability contract (Phase 25.3), client-safe.
// ----------------------------------------------------------------------------
// One shape every score in ZONO can expose so a user NEVER sees "Score: 84"
// without "why". Every reason must originate from real counted data — this layer
// only TRANSPORTS reasons produced by deterministic engines; it never invents.
// ============================================================================

export type ReasonImpact = "positive" | "negative" | "neutral";

export interface ScoreReason {
  /** Human, data-derived statement (e.g. "ביקוש 78/100 — 9 קונים פעילים"). */
  label: string;
  /** Direction of effect on the score (drives the +/− tint). */
  impact: ReasonImpact;
  /** Optional concrete evidence (counts/deltas) behind the reason. */
  evidence?: string;
  /** Where the number came from (e.g. "נתוני שוק", "עסקאות GovMap"). */
  source?: string;
}

export type ExplainableScoreType =
  | "market_opportunity"
  | "territory"
  | "property_exposure"
  | "buyer_match"
  | "seller_confidence"
  | "opportunity";

export interface ScoreExplanation {
  scoreType: ExplainableScoreType;
  /** 0..100 (or a domain value). */
  score: number;
  /** Optional band label (e.g. "פוטנציאל גבוה"). */
  band?: string;
  /** Optional entity linkage (for logging / drill-in). */
  entityType?: string;
  entityId?: string | null;
  reasons: ScoreReason[];
}

/**
 * Infer a reason's impact from its data WITHOUT inventing anything: leading +/−,
 * Hebrew increase/decrease words, and a few risk keywords. Defaults to neutral.
 */
export function inferImpact(label: string): ReasonImpact {
  const t = label.trim();
  if (/(^|\s)\+|עלה|עלייה|עליית|גבוה|חזק|מואץ|צמיחה|הזדמנות|מתחת לממוצע/.test(t)) return "positive";
  if (/(^|\s)[-−]|ירד|ירידה|ירידת|נמוך|חלש|רוויה|תחרות|סיכון|חוסר|מעט/.test(t)) return "negative";
  return "neutral";
}

/** Convert engine-produced reason strings into typed reasons. No fabrication. */
export function coerceReasons(reasons: string[], source?: string): ScoreReason[] {
  return reasons.filter(Boolean).map((label) => ({ label, impact: inferImpact(label), source }));
}

/** Assemble a full explanation from a score + reason strings (the common case). */
export function buildExplanation(input: {
  scoreType: ExplainableScoreType;
  score: number;
  band?: string;
  entityType?: string;
  entityId?: string | null;
  reasons: string[];
  source?: string;
}): ScoreExplanation {
  return {
    scoreType: input.scoreType,
    score: input.score,
    band: input.band,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    reasons: coerceReasons(input.reasons, input.source),
  };
}
