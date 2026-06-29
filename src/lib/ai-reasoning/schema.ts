// ============================================================================
// 📐 Output schema parse + validation (pure). Phase 27.3.
// Parses the model's JSON and coerces it to the strict AIReasoningResponse
// shape. Rejects anything that isn't a usable answer. No AI, deterministic.
// ============================================================================
import type { AIEvidence, AIReasoningResponse, AIReasoningStatus } from "./types";

/** Loosely parse a JSON object from model text (tolerates code fences / prose). */
export function parseModelJson(text: string): unknown {
  const t = (text ?? "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

const STATUSES: ReadonlySet<string> = new Set(["answered", "insufficient_context", "blocked", "error"]);

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function coerceEvidence(v: unknown): AIEvidence[] {
  if (!Array.isArray(v)) return [];
  const out: AIEvidence[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label : "";
    const source = typeof o.source === "string" ? o.source : "";
    if (!label || !source) continue;
    out.push({
      label, source,
      entityType: typeof o.entityType === "string" ? o.entityType : null,
      entityId: typeof o.entityId === "string" ? o.entityId : null,
      field: typeof o.field === "string" ? o.field : null,
      value: o.value == null ? null : String(o.value),
    });
  }
  return out;
}

export interface SchemaResult { ok: boolean; value?: AIReasoningResponse; errors: string[] }

/** Validate + coerce raw model output into a structured response. */
export function validateOutput(raw: unknown): SchemaResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["output is not an object"] };
  const o = raw as Record<string, unknown>;

  const answer = typeof o.answer === "string" ? o.answer.trim() : "";
  if (!answer) errors.push("missing answer");

  let status = (typeof o.status === "string" && STATUSES.has(o.status) ? o.status : "answered") as AIReasoningStatus;
  const evidence = coerceEvidence(o.evidence);
  const confidenceRaw = typeof o.confidence === "number" ? o.confidence : Number(o.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(100, Math.round(confidenceRaw))) : 50;

  // An "answered" result with no evidence is not acceptable — downgrade honestly.
  if (status === "answered" && evidence.length === 0) status = "insufficient_context";

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      status, answer, confidence, evidence,
      missingData: strArr(o.missingData),
      limitations: strArr(o.limitations),
      followUpQuestions: strArr(o.followUpQuestions),
    },
    errors: [],
  };
}
