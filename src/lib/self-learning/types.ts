// ============================================================================
// 🧬 ZONO — Self-Learning AI — types (pure, client-safe). PHASE 54.0.
// Learns from REAL OUTCOMES (never from LLM memory) which copy, groups, hours,
// brokers, streets and price strategies actually work. Rigorous by design:
// repetition + confidence thresholds gate a "learned" pattern, small/mixed
// samples are explicitly held back (false-pattern prevention), and old evidence
// is flagged stale. Output is ADVISORY — it influences existing engines, never
// replaces them, and nothing auto-executes.
// ============================================================================

export const SELF_LEARNING_VERSION = "54.0";

export type LearningDimension = "copy_angle" | "group" | "hour" | "broker" | "street" | "price_strategy";

export const DIMENSION_HE: Record<LearningDimension, string> = {
  copy_angle: "זווית קופי", group: "קבוצה", hour: "שעת פרסום", broker: "סוכן", street: "רחוב/אזור", price_strategy: "אסטרטגיית מחיר",
};

export type Outcome = "success" | "failure";
export type PatternStatus = "learned" | "emerging" | "inconclusive" | "insufficient" | "stale";
export type Direction = "boost" | "caution" | "none";

export const STATUS_HE: Record<PatternStatus, string> = {
  learned: "נלמד", emerging: "מתגבש", inconclusive: "לא חד-משמעי", insufficient: "אין מספיק דגימות", stale: "מיושן",
};

/** One real outcome observation on a dimension value. */
export interface LearningSignal {
  dimension: LearningDimension;
  value: string;             // canonical key (e.g. group id, hour bucket, angle)
  label: string;             // human label
  outcome: Outcome;
  weight?: number;           // optional (e.g. #leads); defaults to 1
  at: string;                // ISO timestamp of the outcome
}

export interface LearningThresholds {
  minSample: number;         // repetition gate — below this → "insufficient"
  learnConfidence: number;   // confidence gate to promote to "learned"
  strongRate: number;        // success-rate to boost (%)
  weakRate: number;          // success-rate to caution (%)
  staleDays: number;         // evidence older than this → stale
}

export const DEFAULT_THRESHOLDS: LearningThresholds = { minSample: 3, learnConfidence: 60, strongRate: 65, weakRate: 35, staleDays: 120 };

export interface LearnedPattern {
  dimension: LearningDimension;
  value: string; label: string;
  status: PatternStatus;
  sample: number; successes: number; failures: number;
  successRate: number;       // 0..100
  confidence: number;        // 0..100 (capped by sample + staleness)
  direction: Direction;
  recommendation: string;    // advisory
  evidence: string[];
  firstAt: string | null; lastAt: string | null;
  recencyDays: number | null;
  stale: boolean;
}

export interface DimensionLearning {
  dimension: LearningDimension; dimensionHe: string;
  patterns: LearnedPattern[];      // sorted; strongest signals first
  topWinner: LearnedPattern | null;
  topLoser: LearnedPattern | null;
  learnedCount: number;
}

export interface LearningRecommendation {
  dimension: LearningDimension; dimensionHe: string;
  direction: Direction; text: string; confidence: number; evidence: string[]; targetHref: string | null;
}

export interface LearningReport {
  version: string; generatedAt: string | null;
  dimensions: DimensionLearning[];
  recommendations: LearningRecommendation[];
  totals: { signals: number; learned: number; insufficient: number; stale: number };
  hasData: boolean;
  notes: string[];
}

export const ADVISORY_NOTE =
  "התובנות נלמדות מתוצאות אמת בלבד (לא מזיכרון מודל שפה). הן המלצות מייעצות שמחדדות את המנועים הקיימים — אינן מחליפות אותם, ושום דבר לא מבוצע אוטומטית. דפוסים עם מעט דגימות או ראיות ישנות מסומנים ואינם נחשבים ל״נלמד״.";
