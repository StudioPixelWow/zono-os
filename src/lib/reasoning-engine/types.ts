// ============================================================================
// 🧠 ZONO Reasoning Engine™ — types (client-safe, pure). Phase 27.3.
// ----------------------------------------------------------------------------
// The official intelligence-orchestration contract that sits BETWEEN ZONO
// Knowledge (the Universal Context Engine, Phase 27.2) and the LLM (the AI
// Reasoning Gateway). This is NOT a chatbot and NOT prompt engineering — it is
// the single pipeline every future AI capability flows through:
//   intent → routing → context → reasoning → LLM → explainability → response.
// The engine NEVER reads repositories directly; it only consumes a
// ContextPackage. The LLM never becomes a source of truth. No DB, no schema.
// ============================================================================
import type { ContextPackage, ContextType } from "@/lib/context-engine/types";
import type { AILanguage } from "@/lib/ai-reasoning/types";

export const REASONING_ENGINE_VERSION = "27.3.0";

// ── Part 1 — Intent families ────────────────────────────────────────────────
export type IntentFamily =
  | "PROPERTY" | "BROKER" | "OFFICE" | "BUYER" | "SELLER" | "MARKET"
  | "VALUATION" | "TASK" | "CRM" | "COMMUNICATION" | "CALENDAR"
  | "GENERAL" | "SYSTEM" | "SEARCH" | "UNKNOWN";

export interface IntentResult {
  intent: IntentFamily;
  confidence: number;            // 0–100
  entities: string[];            // surfaced tokens (cities, ids, names) — never interpreted
  requiresReasoning: boolean;    // needs the reasoning layer (vs. a trivial lookup)
  requiresSystemData: boolean;   // needs the ZONO Context Engine
  requiresLLM: boolean;          // needs the LLM for wording/synthesis
}

// ── Part 2 — Routing ────────────────────────────────────────────────────────
export type ReasoningRoute = "zono_context" | "llm_only" | "insufficient" | "blocked";

export interface RoutingDecision {
  route: ReasoningRoute;
  requiresSystemData: boolean;
  requiresReasoning: boolean;
  requiresLLM: boolean;
  contextType: ContextType | null;   // which context to load (null → none)
  reason: string;
}

// ── Part 5 — Reasoning modes ────────────────────────────────────────────────
export type ReasoningMode =
  | "explain" | "compare" | "recommend" | "summarize" | "analyze"
  | "prioritize" | "forecast" | "risk" | "contradiction" | "decision" | "scenario";

export type ReasoningDepth = "shallow" | "standard" | "deep";

// ── Part 3 — Reasoning request ──────────────────────────────────────────────
export interface ReasoningRequest {
  question: string;
  language: AILanguage;
  organizationId?: string | null;
  userId?: string | null;
  /** Optional explicit mode; otherwise inferred from the question. */
  mode?: ReasoningMode;
  depth?: ReasoningDepth;
  /** A prebuilt ContextPackage to REUSE (Part 11 — never load context twice). */
  context?: ContextPackage | null;
  /** Routing hints (override the classifier's context type / entity scope). */
  contextType?: ContextType | null;
  entityId?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  conversationId?: string | null;
  memory?: string[];             // prior-turn summaries (optional)
  permissions?: { isManager?: boolean };
}

// ── Part 4 — Evidence graph ─────────────────────────────────────────────────
export interface EvidenceNode {
  id: string;                    // stable node id (block key or block:evidence idx)
  label: string;
  source: string;                // repository/service that produced it
  entity: string | null;         // entity the statement is about
  confidence: number | null;     // 0–100 or null
  timestamp: string;             // ISO — when the context was built
  reason: string;                // why this node is relevant
}
export interface EvidenceGraph {
  nodes: EvidenceNode[];
  sources: string[];
  entities: string[];
  timestamp: string;
  blockCount: number;
}

// ── Part 8 — Response contract ──────────────────────────────────────────────
export type ReasoningStatus =
  | "answered" | "general_knowledge" | "insufficient_evidence" | "blocked" | "error";

export interface EvidenceRef {
  label: string;
  source: string;
  entity?: string | null;
  confidence?: number | null;
  reason?: string | null;
}

export interface ReasoningResponse {
  status: ReasoningStatus;
  answer: string;
  confidence: number;            // 0–100
  reasoningMode: ReasoningMode;
  intent: IntentResult;
  routing: RoutingDecision;
  // Explainability (Part 7).
  usedEvidence: EvidenceRef[];
  missingEvidence: string[];
  warnings: string[];
  relatedEntities: string[];
  supportingSignals: string[];
  contradictions: string[];
  reasoningSteps: string[];
  recommendedNextActions: string[];
  // Diagnostics (never sensitive).
  provider?: string;
  cacheKey?: string;
  version: string;
}
