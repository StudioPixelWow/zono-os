// ============================================================================
// ✅ AI Reasoning QA — offline, deterministic self-check (pure). Phase 27.3.
// Runs the gateway with mock providers + a stubbed ContextPackage (built from
// the context-engine STUB_SOURCES). No network, no real model, no DB.
// Covers: answered, insufficient_context, blocked (private / bad source /
// fabricated id), config error, hebrew default, determinism, no execution.
// ============================================================================
import { buildContextPackage } from "@/lib/context-engine/engine";
import { STUB_SOURCES } from "@/lib/context-engine/qa";
import { runReasoningGateway } from "./gateway";
import type { AIProvider, AIReasoningRequest } from "./types";
import type { ContextPackage } from "@/lib/context-engine/types";

export interface QaCheck { name: string; ok: boolean; detail: string }
export interface QaResult { passed: boolean; checks: QaCheck[] }

function mockProvider(name: string, payload: unknown): AIProvider {
  return { name, isConfigured: () => true, complete: async () => JSON.stringify(payload) };
}
function throwingProvider(): AIProvider {
  return { name: "mock-throw", isConfigured: () => true, complete: async () => { throw new Error("boom"); } };
}

async function strongContext(): Promise<ContextPackage> {
  return buildContextPackage({ type: "property", entityId: "p1", city: "חיפה", neighborhood: "כרמל", size: "large" }, STUB_SOURCES);
}
async function emptyContext(): Promise<ContextPackage> {
  // type "task" with no location/entity → only the identity block → no substantive context.
  return buildContextPackage({ type: "task", size: "medium" }, STUB_SOURCES);
}

const reqFor = (ctx: ContextPackage, question: string): AIReasoningRequest => ({ question, context: ctx, mode: "answer", language: "he" });

export async function runSelfCheck(): Promise<QaResult> {
  const checks: QaCheck[] = [];
  const add = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  const strong = await strongContext();
  const goodSource = strong.blocks.find((b) => b.key !== "identity")?.source ?? "identity";
  const goodPayload = {
    status: "answered", answer: "המשרד המוביל בשכונה הוא רי/מקס כרמל לפי שליטה אזורית.", confidence: 80,
    evidence: [{ label: "משרד מוביל", source: goodSource, entityType: "office", entityId: "org_demo", field: "leaderOffice", value: "רי/מקס כרמל" }],
    missingData: [], limitations: [], followUpQuestions: ["מי המתחרה הקרוב?"],
  };

  // 1) strong context → answered with evidence
  const r1 = await runReasoningGateway(reqFor(strong, "איזה משרד מוביל בשכונה?"), mockProvider("mock-good", goodPayload));
  add("1-answered-with-evidence", r1.status === "answered" && r1.evidence.length > 0, r1.status);

  // 2) missing context → insufficient_context (provider never reached)
  const r2 = await runReasoningGateway(reqFor(await emptyContext(), "למה הנכס קיבל הערכה כזו?"), mockProvider("mock-good", goodPayload));
  add("2-insufficient-context", r2.status === "insufficient_context", r2.status);

  // 3) question for private data → blocked
  const r3 = await runReasoningGateway(reqFor(strong, "מה הטלפון של המוכר?"), mockProvider("mock-good", goodPayload));
  add("3-blocked-private", r3.status === "blocked", r3.status);

  // 4) fabricated entity id → blocked
  const r4 = await runReasoningGateway(reqFor(strong, "מי המתווך החזק?"), mockProvider("mock-fab", {
    ...goodPayload, evidence: [{ label: "x", source: goodSource, entityId: "ghost_999" }],
  }));
  add("4-blocked-fabricated-id", r4.status === "blocked", r4.status);

  // 5) evidence cites unknown source → blocked
  const r5 = await runReasoningGateway(reqFor(strong, "מי המתווך החזק?"), mockProvider("mock-badsrc", {
    ...goodPayload, evidence: [{ label: "x", source: "secret-db.private" }],
  }));
  add("5-blocked-unknown-source", r5.status === "blocked", r5.status);

  // 6) provider throws → error
  const r6 = await runReasoningGateway(reqFor(strong, "מה קורה?"), throwingProvider());
  add("6-provider-error", r6.status === "error", r6.status);

  // 7) no provider configured → safe config error (temporarily clear key)
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const r7 = await runReasoningGateway(reqFor(strong, "מה קורה?"));
  if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  add("7-no-key-safe-error", r7.status === "error" && r7.answer.length > 0, r7.status);

  // 8) hebrew default pass-through
  add("8-hebrew-default", r1.answer.includes("מוביל") || /[֐-׿]/.test(r1.answer), "rtl");

  // 9) no execution + only structured data (no functions / unexpected keys)
  const allowed = new Set(["status", "answer", "confidence", "evidence", "missingData", "limitations", "followUpQuestions", "provider", "cacheKey", "version"]);
  const r1Keys = Object.keys(r1);
  add("9-structured-only", r1Keys.every((k) => allowed.has(k)) && typeof r1.answer === "string", r1Keys.join(","));

  // 10) deterministic for same mocked provider
  const r1b = await runReasoningGateway(reqFor(strong, "איזה משרד מוביל בשכונה?"), mockProvider("mock-good", goodPayload));
  add("10-deterministic", JSON.stringify(r1) === JSON.stringify(r1b), "same-output");

  return { passed: checks.every((c) => c.ok), checks };
}
