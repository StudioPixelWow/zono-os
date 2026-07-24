// ============================================================================
// 🤖 ZONO — Copilot LLM ENRICHMENT (server-only). Phase 5.
// ----------------------------------------------------------------------------
// Routes ALL AI through the existing AI Reasoning Gateway (no direct model call,
// no new provider). The gateway already fails safe (unavailable → error, bad
// JSON → error, schema fail → blocked, evidence validation). On top of that we
// run our own fact validation and ALWAYS fall back to the deterministic output
// on any rejection — the LLM improves readability only, never replaces reasoning.
// Records a full AI audit (provider/model/latency/tokens/cost/validation).
// ============================================================================
import "server-only";
import { runReasoningGateway } from "@/lib/ai-reasoning/gateway";
import type { AIProvider } from "@/lib/ai-reasoning/types";
import type { ContextPackage } from "@/lib/context-engine/types";
import { decideEnrichment, estimateUsage, type DeterministicRef, type EnrichKind, type GatewayOutcome } from "./enrich-core";

export interface EnrichmentAudit {
  provider: string | null; model: string | null; latencyMs: number;
  estTokens: number; estCostUsd: number; validationStatus: string; accepted: boolean; rejected: boolean;
}
export interface EnrichResult {
  kind: EnrichKind; output: string; accepted: boolean; validationStatus: string; audit: EnrichmentAudit;
}

/** Minimal sanitized ContextPackage carrying ONLY the deterministic facts. The
 *  model never sees the DB — just these facts (the gateway digests `blocks`). */
function enrichmentContext(orgId: string | null, det: DeterministicRef): ContextPackage {
  return {
    request: { type: "mission-control", entityId: null, city: null, neighborhood: null, screen: null, workflow: null } as ContextPackage["request"],
    identity: { orgId, orgName: null, userId: null, userName: null, isManager: false },
    screen: null, workflow: null,
    blocks: [{ key: "copilot_deterministic", label: "Deterministic Copilot output", priority: 100, data: { text: det.text, allowedNumbers: det.allowedNumbers, allowedTerms: det.allowedTerms }, evidence: [], confidence: 100, source: "comm-copilot" }],
    permissions: { isManager: false, removedBlocks: [], redactedFields: [] },
    explain: { repositoriesUsed: ["comm-copilot"], entitiesCollected: [], confidence: 100, missing: [], prioritySummary: [], size: "small", blockCount: 1, approxChars: det.text.length } as unknown as ContextPackage["explain"],
    cacheKey: `copilot-enrich:${det.text.length}`,
  };
}

const INSTRUCTION: Record<EnrichKind, string> = {
  summary: "נסח מחדש את הסיכום הבא לקריאוּת טובה יותר בלבד. אל תמציא עובדות. השתמש אך ורק בעובדות שסופקו.",
  reply: "שפר ניסוח, טון וזרימה של הטיוטה הבאה בלבד. אל תשנה כוונה, המלצה, התחייבויות או עובדות. אל תמציא מספרים או מקומות.",
  classification: "בהינתן שיחה מעורפלת, בחר את הסיווג המתאים ביותר מתוך הרשימה הקבועה בלבד. הסבר בקצרה.",
};

/** Enrich one deterministic artifact through the gateway, with fact validation
 *  and deterministic fallback. `provider` is injectable for tests. Never throws. */
export async function enrichText(kind: EnrichKind, orgId: string | null, det: DeterministicRef, provider?: AIProvider): Promise<EnrichResult> {
  const t0 = Date.now();
  const question = `${INSTRUCTION[kind]}\n\n---\n${det.text}`;
  let answer = "", status = "error", respProvider: string | null = null, ok = false;
  try {
    const resp = await runReasoningGateway({ question, context: enrichmentContext(orgId, det), mode: "summarize", language: "he", organizationId: orgId }, provider);
    answer = resp.answer; status = resp.status; respProvider = resp.provider ?? null; ok = resp.status === "answered";
  } catch { /* gateway never throws in practice; guard anyway → fallback */ }
  const latencyMs = Date.now() - t0;

  const outcome: GatewayOutcome = { ok, status, answer, provider: respProvider ?? undefined };
  const decision = decideEnrichment(det, outcome);
  const usage = estimateUsage(question.length, answer.length);
  const audit: EnrichmentAudit = {
    provider: respProvider, model: respProvider, latencyMs,
    estTokens: usage.estTokens, estCostUsd: usage.estCostUsd,
    validationStatus: decision.validationStatus, accepted: decision.accepted, rejected: !decision.accepted,
  };
  return { kind, output: decision.output, accepted: decision.accepted, validationStatus: decision.validationStatus, audit };
}
