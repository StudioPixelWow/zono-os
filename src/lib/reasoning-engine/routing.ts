// ============================================================================
// 🧭 Routing (pure). Phase 27.3 · Part 2.
// ----------------------------------------------------------------------------
// Decides — from the intent alone — whether a request needs ZONO knowledge
// (Context Engine → Reasoning → LLM wording) or is general knowledge (LLM only),
// and which ContextType to load. No unnecessary context is ever loaded.
// Deterministic. No AI, no DB.
// ============================================================================
import type { ContextType } from "@/lib/context-engine/types";
import type { IntentFamily, IntentResult, RoutingDecision } from "./types";

// Intent family → the Context Engine context type it should load.
const CONTEXT_BY_INTENT: Record<IntentFamily, ContextType | null> = {
  PROPERTY: "property", BROKER: "broker", OFFICE: "office", BUYER: "buyer",
  SELLER: "seller", MARKET: "market", VALUATION: "valuation", TASK: "task",
  CRM: "action-center", COMMUNICATION: "communication", CALENDAR: "calendar",
  SEARCH: "action-center", SYSTEM: "organization",
  GENERAL: null, UNKNOWN: null,
};

/** Decide the route for a classified intent. `contextTypeOverride` wins when set. */
export function routeIntent(intent: IntentResult, contextTypeOverride?: ContextType | null): RoutingDecision {
  // General knowledge → LLM only, never touch ZONO context (Part 2).
  if (intent.intent === "GENERAL") {
    return {
      route: "llm_only", requiresSystemData: false, requiresReasoning: false,
      requiresLLM: true, contextType: null,
      reason: "שאלת ידע כללי — נענית ע״י המודל בלבד, ללא הקשר ZONO.",
    };
  }
  if (intent.intent === "UNKNOWN") {
    return {
      route: "llm_only", requiresSystemData: false, requiresReasoning: false,
      requiresLLM: true, contextType: null,
      reason: "כוונה לא זוהתה — מטופלת כשאלה כללית (ללא נתוני ZONO).",
    };
  }
  const contextType = contextTypeOverride ?? CONTEXT_BY_INTENT[intent.intent];
  return {
    route: "zono_context",
    requiresSystemData: true,
    requiresReasoning: true,
    requiresLLM: intent.requiresLLM,
    contextType,
    reason: `כוונה ${intent.intent} — נטען הקשר ZONO (${contextType ?? "ארגון"}), ואז הסקה מבוססת-ראיות.`,
  };
}
