// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE STRUCTURED-OUTPUT VALIDATION (PURE). Phase 4.
// ----------------------------------------------------------------------------
// Strict parsing + validation of a classification returned by the Reasoning
// boundary. Anything off-taxonomy, out-of-range, or malformed FAILS SAFELY to a
// low-confidence `unknown` classification — an invalid AI output never becomes a
// confident current signal. Confidence + sentiment score are clamped. No content
// is copied out; only the provider-neutral classification + a short safe rationale.
// ============================================================================
import { isSentiment, isIntent, isUrgency, type Sentiment, type Intent, type Urgency } from "./domain";

export interface RawClassification {
  sentiment?: unknown; sentimentScore?: unknown; intent?: unknown;
  urgency?: unknown; confidence?: unknown; rationale?: unknown;
}
export interface ValidatedClassification {
  ok: boolean;                       // false → safe fallback was used (output was invalid)
  sentiment: Sentiment;
  sentimentScore: number;            // -100..100
  intent: Intent;
  urgency: Urgency;
  confidence: number;                // 0..100
  rationaleSafe: string;
  issues: readonly string[];
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};
const RATIONALE_MAX = 240;
const safeRationale = (v: unknown): string => {
  if (typeof v !== "string") return "";
  // Keep it short + strip anything that looks like a raw payload/URL/token.
  return v.replace(/https?:\/\/\S+/g, "").replace(/[A-Za-z0-9_-]{40,}/g, "").replace(/\s+/g, " ").trim().slice(0, RATIONALE_MAX);
};

/** The safe fallback — used whenever the model output is missing / off-taxonomy. */
export const SAFE_FALLBACK: ValidatedClassification = {
  ok: false, sentiment: "unknown", sentimentScore: 0, intent: "unknown", urgency: "normal",
  confidence: 0, rationaleSafe: "", issues: ["fallback"],
};

/** Validate a raw classification; never throws, always returns a usable signal. */
export function validateClassification(raw: RawClassification | null | undefined): ValidatedClassification {
  if (!raw || typeof raw !== "object") return { ...SAFE_FALLBACK, issues: ["not_an_object"] };
  const issues: string[] = [];

  let sentiment: Sentiment = "unknown";
  if (isSentiment(raw.sentiment)) sentiment = raw.sentiment; else issues.push("bad_sentiment");
  let intent: Intent = "unknown";
  if (isIntent(raw.intent)) intent = raw.intent; else issues.push("bad_intent");
  let urgency: Urgency = "normal";
  if (isUrgency(raw.urgency)) urgency = raw.urgency; else issues.push("bad_urgency");

  const sentimentScore = clampInt(raw.sentimentScore, -100, 100, 0);
  let confidence = clampInt(raw.confidence, 0, 100, 0);
  const rationaleSafe = safeRationale(raw.rationale);

  // If any taxonomy field was invalid, the whole classification is untrustworthy:
  // keep whatever parsed but force confidence to 0 and mark not-ok (fail safe).
  const ok = issues.length === 0;
  if (!ok) confidence = 0;

  // Internal consistency: sentiment score sign should match sentiment bucket; if
  // it contradicts, downgrade confidence (never fabricate agreement).
  if (ok) {
    const contradicts = (sentiment === "positive" && sentimentScore < 0) || (sentiment === "negative" && sentimentScore > 0);
    if (contradicts) { confidence = Math.min(confidence, 40); issues.push("score_sentiment_mismatch"); }
  }

  return { ok, sentiment, sentimentScore, intent, urgency, confidence, rationaleSafe, issues };
}
