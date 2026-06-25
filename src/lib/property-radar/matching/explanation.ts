// ============================================================================
// ZONO Property Radar™ — match explanation (pure, deterministic, Hebrew).
// Turns a score breakdown into human-readable ✓/✗ reasons. This is the ONLY
// layer a future AI explainer would replace: it implements the `MatchExplainer`
// interface, so an AI version can be swapped in without touching the
// deterministic engine, filters or scores (which remain the source of truth).
// ============================================================================
import { DEFAULT_MATCH_WEIGHTS } from "./scoring";
import type {
  MatchExplainer,
  MatchExplanation,
  MatchExplanationContext,
  MatchScoreBreakdown,
  MatchWeights,
} from "./types";

/** A dimension counts as a positive "✓" when it earned ≥75% of its weight. */
const STRONG = 0.75;
/** …and a negative "✗" when it earned ≤35% of its weight (and the weight matters). */
const WEAK = 0.35;

function frac(score: number, weight: number): number {
  return weight > 0 ? score / weight : 1;
}

interface DimSpec {
  key: keyof MatchScoreBreakdown;
  weightKey: keyof MatchWeights;
  positive: string;
  negative: string;
}

const DIMENSIONS: DimSpec[] = [
  { key: "priceScore", weightKey: "budget", positive: "✓ מתאים לתקציב", negative: "✗ פער מול התקציב" },
  { key: "locationScore", weightKey: "location", positive: "✓ באזור המבוקש", negative: "✗ מחוץ לאזור המבוקש" },
  { key: "roomsScore", weightKey: "rooms", positive: "✓ מספר חדרים מתאים", negative: "✗ מספר חדרים לא מתאים" },
  { key: "propertyTypeScore", weightKey: "propertyType", positive: "✓ מתאים לסוג הנכס", negative: "✗ סוג נכס שונה מהמבוקש" },
  { key: "sizeScore", weightKey: "size", positive: "✓ שטח מתאים", negative: "✗ שטח לא מתאים" },
  { key: "parkingScore", weightKey: "parking", positive: "✓ עומד בדרישות החניה", negative: "✗ חסרה חניה" },
  { key: "balconyScore", weightKey: "balcony", positive: "✓ כולל מרפסת", negative: "✗ ללא מרפסת" },
  { key: "floorScore", weightKey: "floor", positive: "✓ קומה מתאימה", negative: "✗ קומה לא מתאימה" },
  { key: "timelineScore", weightKey: "timeline", positive: "✓ קונה בשל לפעולה", negative: "" },
];

function summaryFor(score: number, level: string): string {
  if (level === "perfect") return "התאמה מושלמת — מומלץ ליצור קשר עוד היום";
  if (level === "excellent") return "התאמה מצוינת — שווה פנייה מהירה";
  if (level === "good") return "התאמה טובה — כדאי לבדוק מול הקונה";
  if (level === "possible") return "התאמה אפשרית — שקול לפנות";
  return "אינו מתאים לקריטריונים של הקונה";
}

/** The default, always-available deterministic explainer. */
export const deterministicMatchExplainer: MatchExplainer = {
  explain(ctx: MatchExplanationContext): MatchExplanation {
    const positives: string[] = [];
    const negatives: string[] = [];

    // A hard rejection from the fast filter takes precedence as the headline reason.
    if (ctx.rejection && !ctx.rejection.passed && ctx.rejection.rejectionReason) {
      negatives.push(ctx.rejection.rejectionReason);
    }

    for (const dim of DIMENSIONS) {
      const weight = ctx.weights[dim.weightKey];
      if (weight <= 0) continue;
      const f = frac(ctx.breakdown[dim.key], weight);
      if (f >= STRONG) {
        positives.push(dim.positive);
      } else if (f <= WEAK && dim.negative) {
        // Avoid duplicating a reason already supplied by the rejection headline.
        if (!negatives.includes(dim.negative)) negatives.push(dim.negative);
      }
    }

    return {
      positives,
      negatives,
      summary: summaryFor(ctx.score, ctx.level),
      generatedBy: "deterministic",
    };
  },
};

/** Convenience wrapper used by the engine. */
export function buildMatchExplanation(
  ctx: MatchExplanationContext,
  explainer: MatchExplainer = deterministicMatchExplainer,
): MatchExplanation {
  return explainer.explain({ ...ctx, weights: ctx.weights ?? DEFAULT_MATCH_WEIGHTS });
}
