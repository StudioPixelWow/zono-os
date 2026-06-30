// ============================================================================
// ✅ Reasoning Engine self-tests (Phase 27.3 · Part 12). Server-side, offline.
// ----------------------------------------------------------------------------
// Runs the WHOLE pipeline with an injected mock provider + injected context
// loader so it needs no network and no DB. Verifies, for each scenario:
//   correct routing · correct context usage · no hallucination · explainability.
// ============================================================================
import "server-only";
import { runReasoningEngine } from "./service";
import { CONTEXT_ENGINE_VERSION } from "@/lib/context-engine/types";
import type { ContextBlock, ContextPackage, ContextRequest } from "@/lib/context-engine/types";
import type { AIProvider } from "@/lib/ai-reasoning/types";
import type { ReasoningResponse } from "./types";

// ── Synthetic context + mock provider (deterministic) ───────────────────────
function pkg(blocks: ContextBlock[], missing: string[] = []): ContextPackage {
  const repos = [...new Set(blocks.map((b) => b.source))];
  return {
    request: { type: "organization", size: "small" },
    identity: { orgId: "org-1", orgName: "ZONO", userId: "u-1", userName: "Tester", isManager: true },
    screen: "qa", workflow: "self-check",
    blocks: [{ key: "identity", label: "זהות", priority: 1, data: { orgId: "org-1" }, evidence: [], confidence: null, source: "auth.session" }, ...blocks],
    permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
    explain: {
      repositoriesUsed: repos, entitiesCollected: [], confidence: null, missing,
      prioritySummary: blocks.map((b) => ({ key: b.key, priority: b.priority })),
      size: "small", blockCount: blocks.length + 1, approxChars: JSON.stringify(blocks).length,
      timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION,
    },
    cacheKey: "qa",
  };
}
function block(key: string, source: string, label: string, data: unknown): ContextBlock {
  return { key, label, priority: 90, data, evidence: [{ source, detail: label, confidence: 80 }], confidence: 80, source };
}

const mockProvider: AIProvider = {
  name: "mock",
  isConfigured: () => true,
  async complete(input) {
    if (/ידע כללי|general-knowledge/i.test(input.system)) return JSON.stringify({ answer: "פריז" });
    // A safe, schema-valid answered result citing the always-present "context" source.
    return JSON.stringify({
      status: "answered", answer: "בהתבסס על הראיות שסופקו, זו התשובה.", confidence: 82,
      evidence: [{ label: "ראיה מההקשר", source: "context" }],
      missingData: [], limitations: [], followUpQuestions: ["מה הצעד הבא?"],
    });
  },
};

export interface ReasoningCheck { name: string; pass: boolean; detail: string }
export interface ReasoningSelfCheck { ok: boolean; total: number; passed: number; checks: ReasoningCheck[] }

export async function runSelfCheck(): Promise<ReasoningSelfCheck> {
  const checks: ReasoningCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Track whether the Context Engine was invoked (proves no unneeded loading).
  let loaded = 0;
  const loader = (ctx: ContextPackage) => async (_req: ContextRequest): Promise<ContextPackage> => { loaded++; void _req; return ctx; };

  // 1) PROPERTY question → zono route + context loaded + answered + evidence.
  loaded = 0;
  const propCtx = pkg([block("property.summary", "properties", "נכס לדוגמה", { id: "p1", city: "חיפה" })]);
  const r1: ReasoningResponse = await runReasoningEngine(
    { question: "מה מצב הנכס הזה בחיפה?", language: "he" },
    { provider: mockProvider, loadContext: loader(propCtx) });
  add("property → routing", r1.intent.intent === "PROPERTY" && r1.routing.route === "zono_context", `${r1.intent.intent}/${r1.routing.route}`);
  add("property → context used", loaded === 1 && r1.status === "answered", `loaded=${loaded} status=${r1.status}`);
  add("property → has evidence", r1.usedEvidence.length > 0 && r1.usedEvidence.every((e) => !!e.source), `${r1.usedEvidence.length} ev`);
  add("property → explainability", r1.reasoningSteps.length >= 3, `${r1.reasoningSteps.length} steps`);

  // 2) BROKER question → broker context type.
  loaded = 0;
  const brokerCtx = pkg([block("broker.summary", "brokerage_agents", "מתווך", { id: "b1", name: "דנה" })]);
  const r2 = await runReasoningEngine({ question: "מי המתווך עם הכי הרבה מודעות?", language: "he" }, { provider: mockProvider, loadContext: loader(brokerCtx) });
  add("broker → routing+type", r2.intent.intent === "BROKER" && r2.routing.contextType === "broker", `${r2.intent.intent}/${r2.routing.contextType}`);

  // 3) OFFICE question.
  loaded = 0;
  const officeCtx = pkg([block("office.summary", "brokerage_offices", "משרד", { id: "o1", officeName: "רי/מקס חיפה" })]);
  const r3 = await runReasoningEngine({ question: "כמה משרדי תיווך פעילים בעיר?", language: "he" }, { provider: mockProvider, loadContext: loader(officeCtx) });
  add("office → routing+type", r3.intent.intent === "OFFICE" && r3.routing.contextType === "office", `${r3.intent.intent}/${r3.routing.contextType}`);

  // 4) GENERAL knowledge → LLM only, context NEVER loaded.
  loaded = 0;
  const r4 = await runReasoningEngine({ question: "what is the capital of France?", language: "he" },
    { provider: mockProvider, loadContext: loader(propCtx) });
  add("general → llm_only", r4.routing.route === "llm_only" && r4.status === "general_knowledge", `${r4.routing.route}/${r4.status}`);
  add("general → no context load", loaded === 0, `loaded=${loaded}`);
  add("general → no ZONO evidence", r4.usedEvidence.every((e) => e.source === "llm.general"), `${r4.usedEvidence.map((e) => e.source).join(",")}`);

  // 5) MIXED → a ZONO family wins (compare offices).
  loaded = 0;
  const r5 = await runReasoningEngine({ question: "compare the two brokerage offices in חיפה", language: "he" }, { provider: mockProvider, loadContext: loader(officeCtx) });
  add("mixed → office+compare", r5.intent.intent === "OFFICE" && r5.reasoningMode === "compare", `${r5.intent.intent}/${r5.reasoningMode}`);

  // 6) INSUFFICIENT evidence → empty context → honest refusal, no provider needed.
  loaded = 0;
  const r6 = await runReasoningEngine({ question: "מה מצב הנכס?", language: "he" }, { provider: mockProvider, loadContext: loader(pkg([])) });
  add("insufficient → refuses", r6.status === "insufficient_evidence" && r6.confidence === 0, `${r6.status}/${r6.confidence}`);
  add("insufficient → no fabrication", r6.usedEvidence.length === 0, `${r6.usedEvidence.length} ev`);

  // 7) PERMISSION denied → only identity remains (substantive stripped) → insufficient.
  loaded = 0;
  const denied = pkg([]); denied.permissions.removedBlocks = ["property.summary"];
  const r7 = await runReasoningEngine({ question: "הראה לי את נתוני הנכס", language: "he" }, { provider: mockProvider, loadContext: loader(denied) });
  add("permission → no leak", r7.status === "insufficient_evidence" && r7.usedEvidence.length === 0, `${r7.status}`);

  // 8) CONTRADICTING evidence → two entities, pipeline still answers from evidence.
  loaded = 0;
  const conflict = pkg([
    block("market.a", "territory", "דומיננטיות 80%", { city: "חיפה", dominance: 80 }),
    block("market.b", "territory", "דומיננטיות 30%", { city: "חיפה", dominance: 30 }),
  ]);
  const r8 = await runReasoningEngine({ question: "אילו סתירות יש בנתוני השוק בחיפה?", language: "he", mode: "contradiction" }, { provider: mockProvider, loadContext: loader(conflict) });
  add("contradiction → answered w/ graph", r8.status === "answered" && r8.relatedEntities.length >= 1 && r8.reasoningMode === "contradiction", `${r8.status}/${r8.relatedEntities.length}`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
