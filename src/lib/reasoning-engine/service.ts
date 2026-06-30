// ============================================================================
// 🧠 ZONO Reasoning Engine™ — orchestrator (server-only). Phase 27.3.
// ----------------------------------------------------------------------------
// The single pipeline every AI capability flows through:
//   classifyIntent → routeIntent → (Context Engine) → Evidence Graph →
//   AI Reasoning Gateway (LLM over evidence) → Explainability → Response.
// The engine NEVER reads repositories directly; it consumes a ContextPackage
// (reused if supplied — never loaded twice). The LLM never becomes a source of
// truth. No MAI/BIE/valuation/schema/confidence formulas are touched.
//
// Not "server-only"-imported transitively only where needed: getContext is
// server-only, so this module is server-only too. QA uses runReasoningEngine
// with injected deps (provider + context) so it can run offline.
// ============================================================================
import "server-only";
import { getContext } from "@/lib/context-engine/service";
import { runReasoningGateway } from "@/lib/ai-reasoning/gateway";
import { selectProvider } from "@/lib/ai-reasoning/gateway";
import type { AIProvider, AIReasoningResponse } from "@/lib/ai-reasoning/types";
import type { ContextPackage, ContextRequest, ContextType } from "@/lib/context-engine/types";
import { classifyIntent } from "./intent";
import { routeIntent } from "./routing";
import { buildEvidenceGraph, graphHasEvidence } from "./evidence-graph";
import { inferMode, modeInstruction, modeToAIMode } from "./modes";
import { REASONING_ENGINE_VERSION } from "./types";
import type {
  ReasoningRequest, ReasoningResponse, ReasoningStatus, EvidenceRef, IntentResult, RoutingDecision,
} from "./types";

/** Injectable dependencies so QA can run the full pipeline offline. */
export interface ReasoningDeps {
  provider?: AIProvider | null;                                   // override the LLM provider
  loadContext?: (req: ContextRequest) => Promise<ContextPackage>; // override the Context Engine
}

const GENERAL_NOTE = {
  he: "תשובה זו מבוססת על ידע כללי של המודל ולא על נתוני ZONO.",
  en: "This answer is based on the model's general knowledge, not ZONO data.",
};
const INSUFFICIENT = {
  he: "אין לי מספיק ראיות מאומתות כדי לענות על כך.",
  en: "I don't have enough verified evidence to answer this.",
};
const CONFIG_ERR = {
  he: "מנוע ה-AI אינו מוגדר (חסר OPENAI_API_KEY).",
  en: "The AI engine is not configured (missing OPENAI_API_KEY).",
};

/** The official entry point. Every future AI feature must call this. */
export async function runReasoningEngine(req: ReasoningRequest, deps: ReasoningDeps = {}): Promise<ReasoningResponse> {
  const lang = req.language;
  const intent = classifyIntent(req.question);
  const routing = routeIntent(intent, req.contextType ?? null);
  const mode = req.mode ?? inferMode(req.question);
  const steps: string[] = [
    `סיווג כוונה: ${intent.intent} (${intent.confidence}%)`,
    `ניתוב: ${routing.route} — ${routing.reason}`,
    `מצב הסקה: ${mode}`,
  ];

  // ── Route A — general knowledge: LLM only, never touch ZONO context ───────
  if (routing.route === "llm_only") {
    return generalAnswer(req, intent, routing, mode, steps, deps);
  }

  // ── Route B — ZONO knowledge: load (or reuse) context, reason over evidence ─
  let context: ContextPackage;
  try {
    if (req.context) { context = req.context; steps.push("הקשר ZONO: שימוש חוזר בחבילה קיימת (ללא טעינה כפולה)"); }
    else {
      const ctxReq: ContextRequest = {
        type: (routing.contextType ?? "organization") as ContextType,
        entityId: req.entityId ?? (intent.entities.find((e) => /[0-9a-f-]{36}/i.test(e)) ?? null),
        city: req.city ?? (intent.entities.find((e) => !/[0-9a-f-]{36}/i.test(e)) ?? null),
        neighborhood: req.neighborhood ?? null,
        size: req.depth === "deep" ? "large" : req.depth === "shallow" ? "small" : "medium",
        orgId: req.organizationId ?? null, userId: req.userId ?? null,
      };
      const load = deps.loadContext ?? getContext;
      context = await load(ctxReq);
      steps.push(`הקשר ZONO: נטענו ${context.blocks.length} בלוקים מ-${context.explain.repositoriesUsed.length} מאגרים`);
    }
  } catch (e) {
    console.error("[reasoning-engine] context load failed:", e);
    return base(intent, routing, mode, "error", INSUFFICIENT[lang], 0, steps, {
      warnings: ["טעינת ההקשר נכשלה"], missingEvidence: ["context"],
    });
  }

  // ── Evidence Graph (Part 4) + hallucination gate (Part 6) ─────────────────
  const graph = buildEvidenceGraph(context);
  steps.push(`גרף ראיות: ${graph.nodes.length} צמתים · ${graph.sources.length} מקורות · ${graph.entities.length} ישויות`);
  if (!graphHasEvidence(graph)) {
    return base(intent, routing, mode, "insufficient_evidence", INSUFFICIENT[lang], 0, steps, {
      missingEvidence: context.explain.missing.length ? context.explain.missing : ["אין בלוקי ראיה זמינים להקשר זה"],
      relatedEntities: graph.entities,
      warnings: ["אין ראיות מאומתות — המנוע אינו מנחש."],
    });
  }

  // ── LLM over the supplied evidence ONLY (the gateway enforces safety) ──────
  const provider = deps.provider ?? selectProvider();
  if (!provider) {
    return base(intent, routing, mode, "error", CONFIG_ERR[lang], 0, steps, { warnings: [CONFIG_ERR[lang]] });
  }
  const question = `${req.question}\n\n[${modeInstruction(mode)}]`;
  const ai: AIReasoningResponse = await runReasoningGateway(
    { question, context, mode: modeToAIMode(mode), language: lang, userId: req.userId ?? null, organizationId: req.organizationId ?? null },
    provider,
  );
  steps.push(`שער ה-AI: סטטוס ${ai.status} · ביטחון ${ai.confidence}%`);

  // ── Map the gateway result into the reasoning response contract (Part 8) ──
  const status: ReasoningStatus =
    ai.status === "answered" ? "answered"
      : ai.status === "blocked" ? "blocked"
        : ai.status === "error" ? "error" : "insufficient_evidence";

  const usedEvidence: EvidenceRef[] = ai.evidence.map((e) => ({
    label: e.label, source: e.source, entity: e.entityId ?? e.entityType ?? null,
    confidence: null, reason: e.field ?? null,
  }));
  // Supporting signals = graph nodes the model did not explicitly cite.
  const cited = new Set(usedEvidence.map((e) => e.source));
  const supportingSignals = graph.nodes
    .filter((n) => !cited.has(n.source)).slice(0, 8).map((n) => `${n.label} (${n.source})`);
  const missingEvidence = [...new Set([...(ai.missingData ?? []), ...context.explain.missing])];

  return {
    status,
    answer: ai.answer || (status === "answered" ? "" : INSUFFICIENT[lang]),
    confidence: ai.confidence,
    reasoningMode: mode, intent, routing,
    usedEvidence, missingEvidence,
    warnings: status === "answered" ? [] : (ai.limitations ?? []),
    relatedEntities: graph.entities,
    supportingSignals,
    contradictions: [],   // surfaced inside the answer for the "contradiction" mode
    reasoningSteps: steps,
    recommendedNextActions: ai.followUpQuestions ?? [],
    provider: ai.provider, cacheKey: ai.cacheKey, version: REASONING_ENGINE_VERSION,
  };
}

// ── General-knowledge path (LLM only, no ZONO context) ──────────────────────
async function generalAnswer(
  req: ReasoningRequest, intent: IntentResult, routing: RoutingDecision,
  mode: ReasoningResponse["reasoningMode"], steps: string[], deps: ReasoningDeps,
): Promise<ReasoningResponse> {
  const lang = req.language;
  const provider = deps.provider ?? selectProvider();
  if (!provider) return base(intent, routing, mode, "error", CONFIG_ERR[lang], 0, steps, { warnings: [CONFIG_ERR[lang]] });

  const sys = lang === "he"
    ? "אתה עונה על שאלות ידע כללי בקצרה ובדיוק. החזר JSON בלבד בפורמט {\"answer\": string}. אל תתייחס לנתוני לקוח/ZONO."
    : "You answer general-knowledge questions concisely and accurately. Return ONLY JSON {\"answer\": string}. Do not reference any ZONO/customer data.";
  let answer = "";
  try {
    const raw = await Promise.race([
      provider.complete({ system: sys, user: req.question }),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
    ]);
    const parsed = JSON.parse(raw) as { answer?: unknown };
    answer = typeof parsed.answer === "string" ? parsed.answer : "";
  } catch (e) {
    console.error("[reasoning-engine] general answer failed:", e);
    return base(intent, routing, mode, "error", INSUFFICIENT[lang], 0, steps, { warnings: ["שגיאת ספק"] });
  }
  steps.push("מסלול ידע כללי: נענה ע״י המודל ללא הקשר ZONO");
  return base(intent, routing, mode, "general_knowledge", answer || INSUFFICIENT[lang], answer ? 60 : 0, steps, {
    usedEvidence: [{ label: "ידע כללי של המודל", source: "llm.general", entity: null, confidence: null, reason: null }],
    warnings: [GENERAL_NOTE[lang]], provider: provider.name,
  });
}

// ── Builder for non-LLM-evidence responses (errors / general / insufficient) ─
function base(
  intent: IntentResult, routing: RoutingDecision, mode: ReasoningResponse["reasoningMode"],
  status: ReasoningStatus, answer: string, confidence: number, steps: string[],
  extra: Partial<ReasoningResponse> = {},
): ReasoningResponse {
  return {
    status, answer, confidence, reasoningMode: mode, intent, routing,
    usedEvidence: extra.usedEvidence ?? [], missingEvidence: extra.missingEvidence ?? [],
    warnings: extra.warnings ?? [], relatedEntities: extra.relatedEntities ?? [],
    supportingSignals: extra.supportingSignals ?? [], contradictions: extra.contradictions ?? [],
    reasoningSteps: steps, recommendedNextActions: extra.recommendedNextActions ?? [],
    provider: extra.provider, cacheKey: extra.cacheKey, version: REASONING_ENGINE_VERSION,
  };
}
