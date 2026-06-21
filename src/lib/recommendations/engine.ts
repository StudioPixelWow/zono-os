/**
 * Recommendation Intelligence OS — pure deterministic engine.
 *
 * No LLM, no I/O, no `server-only` — safe to import on client or server. Every
 * function is a pure transform of plain inputs, so it is fully testable and
 * reproducible. The engine turns signals already produced by the other ZONO
 * brains (match probability, transaction evidence, geo/market confidence, deal
 * forecast, revenue impact, …) into an explainable recommendation: a score, a
 * confidence, an urgency, an impact, an expected business value, a reason and a
 * next best action.
 *
 * Guiding rule (Part 21): never claim high confidence on weak evidence. When
 * evidence is insufficient the engine downgrades confidence and routes the
 * recommendation to a `needs_more_data` review state instead of pretending.
 */

// ── Shared scalar helpers ────────────────────────────────────────────────────
export const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

const avg = (...xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Weighted blend of {value 0-100, weight} pairs, normalised by total weight. */
export function weightedScore(parts: { value: number; weight: number }[]): number {
  const active = parts.filter((p) => p.weight > 0);
  const total = active.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  return clamp(active.reduce((a, p) => a + clamp(p.value) * p.weight, 0) / total);
}

// ── Types ────────────────────────────────────────────────────────────────────
export type SourceConfidence = "verified" | "high" | "medium" | "low" | "insufficient";
export type ReviewStatus = "pending" | "approved" | "rejected" | "needs_more_data";
export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export type RecommendationType =
  | "buyer_property" | "buyer_transaction_package" | "buyer_neighborhood" | "buyer_street"
  | "buyer_financing_check" | "seller_pricing" | "seller_buyer_pool" | "seller_marketing_plan"
  | "seller_transaction_package" | "property_buyer" | "property_pricing" | "property_marketing"
  | "property_distribution" | "lead_property" | "lead_followup" | "lead_routing"
  | "acquisition_seller_outreach" | "acquisition_property_research" | "deal_closing_action"
  | "deal_negotiation_action" | "agent_street_focus" | "agent_locality_focus" | "office_growth_focus"
  | "community_promotion" | "territory_focus" | "referral_opportunity" | "document_required"
  | "signature_required" | "calculator_required" | "call_summary_required"
  // Territory Intelligence types
  | "street_focus" | "building_cluster_focus" | "territory_acquisition" | "territory_marketing"
  | "territory_revenue" | "territory_coverage_gap" | "territory_competitor_threat";

/** A single explainable piece of evidence attached to a recommendation. */
export interface EvidenceItem {
  kind: "transaction" | "match" | "geo" | "market" | "forecast" | "buyer" | "seller" | "deal" | "communication" | "graph" | "inventory";
  label_hebrew: string;
  weight: number; // 0-100, how strongly this supports the recommendation
  detail?: string;
}

/**
 * The blended signal set the engine scores. All fields are 0-100 unless noted;
 * every field is optional — absent signals simply drop out of the weighting,
 * which is exactly what keeps weak-evidence recommendations honest.
 */
export interface RecommendationSignals {
  entityFit?: number;           // how well source/target fit (match compatibility)
  matchProbability?: number;    // forecasted probability this becomes a deal
  transactionEvidence?: number; // strength of comparable real transactions
  geoConfidence?: number;       // confidence in street/neighborhood data
  marketDemand?: number;        // demand/heat for the area or segment
  buyerReadiness?: number;
  sellerTrust?: number;
  propertyHealth?: number;
  dealForecast?: number;        // closing probability from forecast brain
  revenueImpact?: number;       // 0-100 normalised revenue significance
  communicationFreshness?: number; // recency/health of comms (0=stale,100=fresh)
  graphStrength?: number;       // relationship strength from knowledge graph
  urgencySignal?: number;       // external urgency (price drop, deadline, overdue)
}

// ── 1. Evidence strength ─────────────────────────────────────────────────────
/**
 * Aggregate evidence into a 0-100 strength. More distinct, higher-weight
 * evidence items → stronger. A single weak item caps low. Returns 0 for none.
 */
export function calculateEvidenceStrength(evidence: EvidenceItem[]): number {
  if (!evidence.length) return 0;
  const top = [...evidence].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const peak = clamp(top[0].weight);
  const breadthBonus = Math.min(20, (top.length - 1) * 5); // diversity of support
  const body = weightedScore(top.map((e) => ({ value: e.weight, weight: e.weight || 1 })));
  // Blend the single strongest signal with the weighted body + a breadth bonus.
  return clamp(peak * 0.5 + body * 0.5 + breadthBonus * (body / 100));
}

/** Map an evidence-strength score to the discrete source_confidence label. */
export function classifySourceConfidence(evidenceStrength: number, hasVerifiedTransactions = false): SourceConfidence {
  if (evidenceStrength <= 0) return "insufficient";
  if (hasVerifiedTransactions && evidenceStrength >= 80) return "verified";
  if (evidenceStrength >= 75) return "high";
  if (evidenceStrength >= 50) return "medium";
  if (evidenceStrength >= 25) return "low";
  return "insufficient";
}

// ── 2. Confidence ────────────────────────────────────────────────────────────
/**
 * Confidence is bounded by evidence: it can never exceed evidence strength by
 * much. We blend evidence (dominant) with signal coherence (do the inputs
 * agree?). This enforces Part 21 — strong claims need strong proof.
 */
export function calculateRecommendationConfidence(signals: RecommendationSignals, evidenceStrength: number): number {
  const present = Object.values(signals).filter((v): v is number => typeof v === "number");
  if (!present.length) return clamp(evidenceStrength * 0.6);
  const mean = avg(...present);
  // Coherence: low variance among signals → higher confidence.
  const variance = avg(...present.map((v) => (v - mean) ** 2));
  const coherence = clamp(100 - Math.sqrt(variance)); // 0 spread → 100
  const raw = weightedScore([
    { value: evidenceStrength, weight: 3 },
    { value: mean, weight: 2 },
    { value: coherence, weight: 1 },
  ]);
  // Hard ceiling: confidence cannot run far ahead of the evidence behind it.
  return clamp(Math.min(raw, evidenceStrength + 15));
}

// ── 3. Urgency ───────────────────────────────────────────────────────────────
export function calculateRecommendationUrgency(signals: RecommendationSignals, opts?: { overdue?: boolean; expiringSoon?: boolean }): number {
  const base = weightedScore([
    { value: signals.urgencySignal ?? 0, weight: 3 },
    { value: signals.marketDemand ?? 0, weight: 1 },
    { value: signals.communicationFreshness != null ? 100 - signals.communicationFreshness : 0, weight: 1 },
  ]);
  let u = base;
  if (opts?.overdue) u += 20;
  if (opts?.expiringSoon) u += 15;
  return clamp(u);
}

// ── 4. Impact ────────────────────────────────────────────────────────────────
export function calculateRecommendationImpact(signals: RecommendationSignals): number {
  return weightedScore([
    { value: signals.revenueImpact ?? 0, weight: 3 },
    { value: signals.dealForecast ?? signals.matchProbability ?? 0, weight: 2 },
    { value: signals.entityFit ?? 0, weight: 1 },
    { value: signals.graphStrength ?? 0, weight: 1 },
  ]);
}

// ── 5. Overall recommendation score ──────────────────────────────────────────
/**
 * The headline 0-100 score. Blends fit, evidence, probability, demand, impact
 * and confidence. Confidence acts as a multiplier-ish weight so that an
 * attractive-but-unproven idea cannot outrank a slightly smaller, proven one.
 */
export function calculateRecommendationScore(
  signals: RecommendationSignals,
  evidenceStrength: number,
  confidence: number,
  impact: number,
): number {
  const core = weightedScore([
    { value: signals.entityFit ?? 0, weight: 2 },
    { value: signals.matchProbability ?? signals.dealForecast ?? 0, weight: 2 },
    { value: evidenceStrength, weight: 2 },
    { value: signals.marketDemand ?? 0, weight: 1 },
    { value: signals.buyerReadiness ?? signals.sellerTrust ?? signals.propertyHealth ?? 0, weight: 1 },
    { value: impact, weight: 2 },
    { value: signals.communicationFreshness ?? 50, weight: 0.5 },
    { value: signals.graphStrength ?? 0, weight: 0.5 },
  ]);
  // Confidence gate: scale the core toward itself by how much we believe it.
  return clamp(core * (0.55 + 0.45 * clamp01(confidence / 100)));
}

// ── 6/7. Expected business value ─────────────────────────────────────────────
/**
 * Expected revenue = deal value × probability. Probability is taken from the
 * forecast/match signals (0-100 → 0-1). Returns 0 when no value is known.
 */
export function calculateExpectedRevenue(dealValue: number, signals: RecommendationSignals): number {
  const p = clamp01((signals.dealForecast ?? signals.matchProbability ?? 0) / 100);
  const v = Number.isFinite(dealValue) && dealValue > 0 ? dealValue : 0;
  return Math.round(v * p);
}

export function calculateExpectedCommission(expectedRevenue: number, commissionPct = 2): number {
  const pct = commissionPct > 0 && commissionPct < 100 ? commissionPct : 2;
  return Math.round(expectedRevenue * (pct / 100));
}

/** Expected conversion lift (percentage points) this recommendation adds. */
export function calculateExpectedConversionLift(signals: RecommendationSignals, evidenceStrength: number): number {
  // A recommendation lifts more when there is headroom (low current forecast)
  // and solid evidence behind it. Capped at 40 points.
  return clamp(Math.round((100 - (signals.dealForecast ?? 50)) * 0.15 * clamp01(evidenceStrength / 100)), 0, 40);
}

// ── 8. Priority ──────────────────────────────────────────────────────────────
export function deriveRecommendationPriority(score: number, urgency: number, impact: number): RecommendationPriority {
  const blended = weightedScore([
    { value: score, weight: 2 },
    { value: urgency, weight: 1.5 },
    { value: impact, weight: 1.5 },
  ]);
  if (blended >= 80) return "critical";
  if (blended >= 60) return "high";
  if (blended >= 40) return "medium";
  return "low";
}

// ── Review routing ───────────────────────────────────────────────────────────
/**
 * Decide the human-review state. Insufficient evidence is never auto-approved —
 * it is surfaced as needs_more_data with the reason made explicit elsewhere.
 */
export function deriveReviewStatus(confidence: number, evidenceStrength: number, sourceConfidence: SourceConfidence): ReviewStatus {
  if (sourceConfidence === "insufficient" || evidenceStrength < 25) return "needs_more_data";
  if (confidence < 40) return "needs_more_data";
  return "pending";
}

// ── 9. Next best action ──────────────────────────────────────────────────────
const NEXT_ACTION_BY_TYPE: Record<RecommendationType, string> = {
  buyer_property: "שלח לקונה את הנכס המומלץ וקבע צפייה",
  buyer_transaction_package: "הצג לקונה עסקאות דומות שנמכרו לעיגון ציפיות מחיר",
  buyer_neighborhood: "הצע לקונה לבחון את השכונה המתאימה לתקציבו",
  buyer_street: "הצג לקונה רחוב עם נזילות ומגמת מחיר חיוביות",
  buyer_financing_check: "בדוק יכולת מימון מול פער התקציב לפני המשך",
  seller_pricing: "קיים שיחת תמחור עם המוכר על בסיס עסקאות אמת",
  seller_buyer_pool: "הצג למוכר את מאגר הקונים המתאימים",
  seller_marketing_plan: "אשר עם המוכר תוכנית שיווק והפצה",
  seller_transaction_package: "שלח למוכר דוח עסקאות דומות באזור",
  property_buyer: "פנה לקונים בעלי סבירות גבוהה להמרה",
  property_pricing: "בחן את מחיר הנכס מול עסקאות אחרונות",
  property_marketing: "הפעל קמפיין שיווק ממוקד לנכס",
  property_distribution: "הוסף את הנכס לתור ההפצה היומי",
  lead_property: "שלח לליד נכסים מתאימים מיד",
  lead_followup: "צור מעקב מיידי מול הליד",
  lead_routing: "נתב את הליד לסוכן המתאים ביותר",
  acquisition_seller_outreach: "פנה למוכר עם הצעת ערך מגובת עסקאות",
  acquisition_property_research: "הפק מחקר נכס מלא לפני פנייה",
  deal_closing_action: "בצע את פעולת הסגירה הבאה בעסקה",
  deal_negotiation_action: "התקדם בשלב המשא ומתן עם ראיות מחיר",
  agent_street_focus: "מקד פעילות ברחוב בעל הזדמנות גבוהה",
  agent_locality_focus: "מקד פעילות ביישוב בעל ביקוש גבוה",
  office_growth_focus: "הפנה משאבים למוקד הצמיחה שזוהה",
  community_promotion: "קדם את הנכס בקהילה הרלוונטית",
  territory_focus: "מקד את הטריטוריה בעלת הפוטנציאל",
  referral_opportunity: "פנה להזדמנות הפניה שזוהתה",
  document_required: "השלם את המסמך החסר",
  signature_required: "השג את החתימה הנדרשת",
  calculator_required: "השתמש במחשבון המתאים",
  call_summary_required: "סכם את השיחה/פגישה האחרונה",
  street_focus: "מקד פעילות ברחוב המומלץ",
  building_cluster_focus: "פנה לבעלים בבניין בעל הזדמנות",
  territory_acquisition: "הרץ גיוס נכסים יזום בטריטוריה",
  territory_marketing: "הגדל פרסום ושיווק באזור",
  territory_revenue: "מקד מאמץ באזור בעל פוטנציאל ההכנסה הגבוה",
  territory_coverage_gap: "שייך סוכן לאזור ההזדמנות ללא כיסוי",
  territory_competitor_threat: "בנה אסטרטגיית התמודדות מול שליטת מתחרים",
};

export function deriveNextBestAction(type: RecommendationType, priority: RecommendationPriority): string {
  const base = NEXT_ACTION_BY_TYPE[type] ?? "בדוק את ההמלצה ובצע את הפעולה המתאימה";
  return priority === "critical" ? `דחוף: ${base}` : base;
}

// ── 10. Reason builder ───────────────────────────────────────────────────────
/**
 * Build an explainable Hebrew reason from the top evidence items. Always
 * grounded in real evidence; if evidence is thin it says so explicitly rather
 * than inventing certainty.
 */
export function buildRecommendationReason(evidence: EvidenceItem[], confidence: number): string {
  if (!evidence.length) return "אין כרגע ראיות מספקות — נדרשת השלמת נתונים לפני המלצה ודאית.";
  const top = [...evidence].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const parts = top.map((e) => e.label_hebrew);
  const lead = confidence >= 75 ? "המלצה מבוססת" : confidence >= 50 ? "המלצה אינדיקטיבית" : "המלצה ראשונית (ביטחון נמוך)";
  return `${lead}: ${parts.join(" · ")}.`;
}

// ── 11. Type classification helper ───────────────────────────────────────────
/** Resolve a recommendation_type from source/target entity kinds + intent. */
export function classifyRecommendationType(
  sourceType: string,
  targetType: string,
): RecommendationType {
  const key = `${sourceType}→${targetType}`;
  const map: Record<string, RecommendationType> = {
    "buyer→property": "buyer_property",
    "buyer→transaction": "buyer_transaction_package",
    "buyer→locality": "buyer_neighborhood",
    "buyer→street": "buyer_street",
    "seller→pricing": "seller_pricing",
    "seller→buyer": "seller_buyer_pool",
    "property→buyer": "property_buyer",
    "property→pricing": "property_pricing",
    "property→community": "community_promotion",
    "lead→property": "lead_property",
    "lead→agent": "lead_routing",
    "acquisition→seller": "acquisition_seller_outreach",
    "deal→closing": "deal_closing_action",
    "agent→street": "agent_street_focus",
    "agent→locality": "agent_locality_focus",
    "office→growth": "office_growth_focus",
  };
  return map[key] ?? "referral_opportunity";
}

// ── 12. Ranking ──────────────────────────────────────────────────────────────
export interface RankableRecommendation {
  recommendation_score: number;
  urgency_score: number;
  impact_score: number;
  confidence_score: number;
  expected_revenue?: number;
}

/**
 * Stable composite ranking: prioritise high revenue × high urgency × high
 * confidence. Transaction-backed (high confidence) recommendations rise.
 */
export function rankRecommendations<T extends RankableRecommendation>(recs: T[]): T[] {
  const rankValue = (r: T) => weightedScore([
    { value: r.recommendation_score, weight: 3 },
    { value: r.impact_score, weight: 2 },
    { value: r.urgency_score, weight: 2 },
    { value: r.confidence_score, weight: 1.5 },
  ]);
  return [...recs].sort((a, b) => {
    const d = rankValue(b) - rankValue(a);
    if (d !== 0) return d;
    return (b.expected_revenue ?? 0) - (a.expected_revenue ?? 0);
  });
}

// ── 13. Expiry ───────────────────────────────────────────────────────────────
export interface ExpirableRecommendation { id: string; status: string; expires_at?: string | null; created_at?: string }

/**
 * Return the ids of recommendations that should be expired: past their
 * expires_at, or open and older than `maxAgeDays` with no resolution.
 */
export function expireOldRecommendations(recs: ExpirableRecommendation[], now: Date = new Date(), maxAgeDays = 30): string[] {
  const t = now.getTime();
  const maxAge = maxAgeDays * 86_400_000;
  const open = new Set(["new", "reviewed"]);
  return recs.filter((r) => {
    if (!open.has(r.status)) return false;
    if (r.expires_at && new Date(r.expires_at).getTime() < t) return true;
    if (r.created_at && t - new Date(r.created_at).getTime() > maxAge) return true;
    return false;
  }).map((r) => r.id);
}

// ── Composite builder ────────────────────────────────────────────────────────
export interface ScoredRecommendation {
  recommendation_score: number;
  confidence_score: number;
  urgency_score: number;
  impact_score: number;
  expected_revenue: number;
  expected_commission: number;
  expected_conversion_lift: number;
  source_confidence: SourceConfidence;
  review_status: ReviewStatus;
  priority: RecommendationPriority;
  reason_hebrew: string;
  next_best_action_hebrew: string;
}

/**
 * One-shot scorer used by every generator: takes the blended signals, the
 * evidence and a recommendation type, and returns the full scored bundle ready
 * to persist. Keeps every generator consistent and honest about evidence.
 */
export function buildScoredRecommendation(input: {
  type: RecommendationType;
  signals: RecommendationSignals;
  evidence: EvidenceItem[];
  dealValue?: number;
  commissionPct?: number;
  hasVerifiedTransactions?: boolean;
  overdue?: boolean;
  expiringSoon?: boolean;
}): ScoredRecommendation {
  const evidenceStrength = calculateEvidenceStrength(input.evidence);
  const confidence = calculateRecommendationConfidence(input.signals, evidenceStrength);
  const urgency = calculateRecommendationUrgency(input.signals, { overdue: input.overdue, expiringSoon: input.expiringSoon });
  const impact = calculateRecommendationImpact(input.signals);
  const score = calculateRecommendationScore(input.signals, evidenceStrength, confidence, impact);
  const expectedRevenue = calculateExpectedRevenue(input.dealValue ?? 0, input.signals);
  const expectedCommission = calculateExpectedCommission(expectedRevenue, input.commissionPct);
  const expectedConversionLift = calculateExpectedConversionLift(input.signals, evidenceStrength);
  const sourceConfidence = classifySourceConfidence(evidenceStrength, input.hasVerifiedTransactions);
  const reviewStatus = deriveReviewStatus(confidence, evidenceStrength, sourceConfidence);
  const priority = deriveRecommendationPriority(score, urgency, impact);
  return {
    recommendation_score: score,
    confidence_score: confidence,
    urgency_score: urgency,
    impact_score: impact,
    expected_revenue: expectedRevenue,
    expected_commission: expectedCommission,
    expected_conversion_lift: expectedConversionLift,
    source_confidence: sourceConfidence,
    review_status: reviewStatus,
    priority,
    reason_hebrew: buildRecommendationReason(input.evidence, confidence),
    next_best_action_hebrew: deriveNextBestAction(input.type, priority),
  };
}
