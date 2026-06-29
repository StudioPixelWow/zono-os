// ============================================================================
// 🛡️ Safety layer (pure). Phase 27.3.
// ----------------------------------------------------------------------------
// Pre-send: refuse to call the model unless the request is safe (context exists,
// permissions applied, within size limit, question not probing redacted/private
// data). Post-response: refuse to return anything that cites sources/ids not in
// the context, or that claims with no evidence. Deterministic. No AI, no DB.
// ============================================================================
import { SIZE_BUDGET } from "@/lib/context-engine/compression";
import { buildEvidenceUniverse } from "./evidence";
import type { AIReasoningRequest, AIReasoningResponse, AIReasoningStatus } from "./types";

export interface SafetyVerdict { ok: boolean; status?: AIReasoningStatus; reason?: string }

// Asking for private contact data the permission engine strips → blocked.
const PRIVATE_INTENT = [/\bemail\b/i, /אימייל/, /\bמייל\b/, /phone/i, /טלפון/, /נייד/, /password/i, /סיסמ/];

export function validateRequest(req: AIReasoningRequest): SafetyVerdict {
  if (!req.question || !req.question.trim()) return { ok: false, status: "error", reason: "empty question" };
  if (!req.context) return { ok: false, status: "insufficient_context", reason: "no context" };
  if (!req.context.permissions) return { ok: false, status: "blocked", reason: "permissions not applied" };

  // Substantive context must exist beyond the identity block.
  const substantive = req.context.blocks.filter((b) => b.key !== "identity").length;
  if (substantive === 0) return { ok: false, status: "insufficient_context", reason: "context has no substantive blocks" };

  // Size guard (the digest must fit the model budget for the package size).
  const budget = SIZE_BUDGET[req.context.explain.size];
  if (req.context.explain.approxChars > budget * 1.5) return { ok: false, status: "blocked", reason: "context exceeds size limit" };

  // Forbidden data outside permissions.
  if (PRIVATE_INTENT.some((re) => re.test(req.question))) {
    return { ok: false, status: "blocked", reason: "question requests private/redacted data" };
  }
  return { ok: true };
}

export function validateResponse(resp: AIReasoningResponse, req: AIReasoningRequest): SafetyVerdict {
  if (resp.status === "insufficient_context" || resp.status === "blocked" || resp.status === "error") return { ok: true };

  const uni = buildEvidenceUniverse(req.context);

  // Evidence is required for an answered result.
  if (resp.evidence.length === 0) return { ok: false, status: "insufficient_context", reason: "no evidence" };

  for (const ev of resp.evidence) {
    // Source must reference a real context source/key/repository.
    if (!uni.sources.has(ev.source)) {
      return { ok: false, status: "blocked", reason: `evidence cites unknown source: ${ev.source}` };
    }
    // Any cited entity id must actually exist in the context (no fabricated ids).
    if (ev.entityId && !uni.entityIds.has(ev.entityId) && !uni.serialized.includes(ev.entityId)) {
      return { ok: false, status: "blocked", reason: `evidence cites fabricated entityId: ${ev.entityId}` };
    }
  }
  return { ok: true };
}
