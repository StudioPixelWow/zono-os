// ============================================================================
// 🤖 ZONO — Copilot LLM ENRICHMENT core (pure). Phase 5.
// ----------------------------------------------------------------------------
// The deterministic pipeline is AUTHORITATIVE; the LLM only improves readability.
// This pure core decides whether an enrichment is ACCEPTED or REJECTED (→ fall
// back to deterministic) by validating that the enriched text invents no new
// facts and references only deterministic evidence. No I/O, no model calls — the
// server layer wires the real Reasoning Gateway around these decisions, so the
// validation + fallback logic is fully unit-testable with fabricated outcomes.
// ============================================================================

export type EnrichKind = "summary" | "reply" | "classification";

/** Deterministic reference the enrichment must stay faithful to. */
export interface DeterministicRef {
  text: string;                 // the deterministic output (source of truth)
  allowedNumbers: string[];     // numeric facts permitted (budget, rooms, …)
  allowedTerms: string[];       // permitted named terms (cities, neighborhoods, …)
}

/** A simplified gateway outcome (mapped from AIReasoningResponse or a failure). */
export interface GatewayOutcome {
  ok: boolean;                  // false = unavailable / transport error / timeout
  status: string;               // "answered" | "insufficient_context" | "blocked" | "error"
  answer: string;
  provider?: string;
}

export type ValidationStatus =
  | "accepted" | "rejected_unavailable" | "rejected_status"
  | "rejected_empty" | "rejected_hallucination" | "rejected_unsupported";

export interface EnrichDecision {
  accepted: boolean;
  output: string;               // enriched when accepted, else the deterministic text
  validationStatus: ValidationStatus;
  reason: string;
}

const NUM = /\d[\d.,]*\d|\d/g;
const norm = (s: string) => s.replace(/[,\s]/g, "");
// Known Hebrew place tokens the enrichment might echo — any place NOT already in
// the deterministic reference is treated as an invented (unsupported) fact.
const PLACE = /(תל אביב|רמת גן|גבעתיים|הרצליה|רעננה|כפר סבא|נתניה|חיפה|ירושלים|באר שבע|ראשון לציון|פתח תקווה|חולון|בת ים|מודיעין|אשדוד|פלורנטין|נווה צדק|רמת אביב|בבלי|שפירא|יד אליהו)/g;

/** Evidence validation — reject any enriched text that introduces a number or a
 *  place not present in the deterministic reference (no invented facts). Pure. */
export function validateEnrichedText(enriched: string, det: DeterministicRef): { ok: boolean; status: ValidationStatus; detail: string } {
  if (!enriched.trim()) return { ok: false, status: "rejected_empty", detail: "empty enrichment" };
  const allowedNums = new Set([...det.text.matchAll(NUM)].map((m) => norm(m[0])).concat(det.allowedNumbers.map(norm)));
  for (const m of enriched.matchAll(NUM)) if (!allowedNums.has(norm(m[0]))) return { ok: false, status: "rejected_hallucination", detail: `unsupported number: ${m[0]}` };
  const allowedTerms = new Set([...det.text.matchAll(PLACE)].map((m) => m[0]).concat(det.allowedTerms));
  for (const m of enriched.matchAll(PLACE)) if (!allowedTerms.has(m[0])) return { ok: false, status: "rejected_unsupported", detail: `unsupported place: ${m[0]}` };
  return { ok: true, status: "accepted", detail: "validated" };
}

/** Decide accept/reject for one enrichment. On any rejection the deterministic
 *  text is returned unchanged (fallback). Never throws. */
export function decideEnrichment(det: DeterministicRef, outcome: GatewayOutcome): EnrichDecision {
  if (!outcome.ok) return { accepted: false, output: det.text, validationStatus: "rejected_unavailable", reason: "llm unavailable / transport error / timeout" };
  if (outcome.status !== "answered") return { accepted: false, output: det.text, validationStatus: "rejected_status", reason: `gateway status: ${outcome.status}` };
  const v = validateEnrichedText(outcome.answer, det);
  if (!v.ok) return { accepted: false, output: det.text, validationStatus: v.status, reason: v.detail };
  return { accepted: true, output: outcome.answer, validationStatus: "accepted", reason: "validated" };
}

/** Build the deterministic reference (allowed facts) from text + evidence facts. */
export function buildDeterministicRef(text: string, facts: string[]): DeterministicRef {
  const all = [text, ...facts].join(" ");
  return {
    text,
    allowedNumbers: [...all.matchAll(NUM)].map((m) => m[0]),
    allowedTerms: [...all.matchAll(PLACE)].map((m) => m[0]),
  };
}

/** Deterministic cache key — enrichment is cached and invalidated ONLY when the
 *  deterministic freshness hash changes. */
export function enrichmentCacheKey(kind: EnrichKind, detHash: string): string {
  return `${kind}:${detHash}`;
}

/** Rough, deterministic token/cost estimate (the gateway's provider surface does
 *  not expose token counts). Clearly an ESTIMATE — recorded as such in the audit. */
export function estimateUsage(promptChars: number, answerChars: number): { estTokens: number; estCostUsd: number } {
  const estTokens = Math.ceil((promptChars + answerChars) / 4);
  const estCostUsd = Number(((estTokens / 1000) * 0.0005).toFixed(6)); // nominal rate; estimate only
  return { estTokens, estCostUsd };
}
