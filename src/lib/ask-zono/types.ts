// ============================================================================
// 💬 ZONO — Ask ZONO™ Conversational Intelligence — types (pure). 30.1.
// ----------------------------------------------------------------------------
// ONE conversational interface that makes every existing ZONO engine queryable.
// The pure layer does query understanding (intent/entities/timeframe/filters),
// context planning (which engines must answer) and answer synthesis + explain-
// ability + follow-ups + approval-gated action proposals. The server layer
// executes ONLY the planned engines by REUSING their existing services — no
// engine modified, no business logic duplicated. Evidence-only; every proposed
// action is approval-gated; nothing auto-executes.
// ============================================================================
export const ASK_ZONO_VERSION = "30.1";

// ── Part 1 — query understanding ────────────────────────────────────────────
export type QuestionType = "what_to_do" | "which_entities" | "where" | "how_many" | "status" | "why" | "unknown";
export type IntentType =
  | "DAILY_PRIORITIES" | "SELLERS_AT_RISK" | "BUYERS_CLOSING" | "LISTINGS_PRICE_REDUCTION"
  | "RECRUIT_LOCATION" | "COMPETITION" | "VALUATION" | "MISSIONS" | "LEADS"
  | "OPPORTUNITIES" | "OFFICE_STATUS" | "GENERAL_STATUS"
  // Batch 5.6H — canonical Journey questions ("אילו מסעות תקועים?"). Answered
  // ONLY by the canonical Journey Command provider — never a second engine.
  | "JOURNEYS"
  // Batch 5.8 — executive decision questions ("מה ההחלטות הכי חשובות?").
  // Answered ONLY by the canonical Executive Decision Engine (top-3, inherited
  // priorities/confidence) — additive intent, existing routing untouched.
  | "EXEC_DECISIONS"
  // Batch 5.9 — "מה השתנה מאז הביקור האחרון?" Answered ONLY by Executive
  // Memory (immutable snapshot diffs) — additive, existing routing untouched.
  | "EXEC_MEMORY" | "UNKNOWN";

export type EntityKind = "buyer" | "seller" | "listing" | "lead" | "office" | "broker" | "city" | "property";
export interface DetectedEntity { kind: EntityKind; value: string }
export type Timeframe = "today" | "this_week" | "this_month" | "now" | "any";

export interface QueryUnderstanding {
  raw: string;
  questionType: QuestionType;
  intent: IntentType;
  entities: DetectedEntity[];
  timeframe: Timeframe;
  filters: string[];
  priority: number;            // 0..100 — how urgent/high-value the ask is
  confidence: number;          // 0..100 — understanding confidence
  matchedKeywords: string[];
}

// ── Part 2 — context planner ────────────────────────────────────────────────
export type EngineId =
  | "chief_of_staff" | "orchestrator" | "listing" | "buyer" | "seller" | "lead" | "office"
  | "valuation" | "competitive" | "territory" | "mission" | "decision" | "truth"
  | "customer_journey" | "relationship"
  | "executive_decision"      // 5.8 — the canonical Executive Decision Engine
  | "executive_memory";       // 5.9 — snapshot-diff memory over those decisions
export const ENGINE_HE: Record<EngineId, string> = {
  chief_of_staff: "צ׳יף אוף סטאף", orchestrator: "מנצח הסוכנים", listing: "סוכן מודעות", buyer: "סוכן קונים", seller: "סוכן מוכרים",
  lead: "סוכן לידים", office: "סוכן צמיחת המשרד", valuation: "הערכת שווי", competitive: "מודיעין תחרותי", territory: "מודיעין טריטוריה",
  mission: "מנוע משימות", decision: "מנוע החלטות", truth: "מנוע אמת", customer_journey: "מסע לקוח", relationship: "גרף קשרים",
  executive_decision: "מנוע ההחלטות הניהולי",
  executive_memory: "זיכרון ניהולי",
};
export interface ContextPlan { engines: EngineId[]; reason: string }

// ── Part 3 — normalized engine result (produced by the server executor) ─────
export interface EngineItem { title: string; detail: string; score: number | null }
export interface EngineResult { engine: EngineId; headline: string; items: EngineItem[]; evidence: string[]; confidence: number }

// ── Part 7 — approval-gated action proposals ────────────────────────────────
export type ActionKind = "mission" | "task" | "draft";
export interface ProposedAction {
  kind: ActionKind; title: string; reason: string;
  entityType: string | null; entityId: string | null; missionType: string | null;
  requiresApproval: true;      // always — Ask ZONO never executes
}

// ── Parts 4 + 5 + 6 — synthesized answer ────────────────────────────────────
export interface AskAnswer {
  executiveAnswer: string;
  reasoning: string;
  evidence: string[];
  recommendations: string[];
  actions: ProposedAction[];
  risks: string[];
  opportunities: string[];
  confidence: number;
  // Part 5 — explainability.
  explain: { why: string; sourceEngines: EngineId[]; evidence: string[]; confidence: number; limitations: string[] };
  // Part 6 — follow-ups.
  followUps: string[];
}

// ── Part 8 — session chat ───────────────────────────────────────────────────
export interface ChatTurn { role: "user" | "assistant"; text: string; intent?: IntentType; at: string }

// The shared AI-context envelope carried with every internal Ask response —
// assembled ONCE by the canonical ai-context assembler, permission-safe, with a
// provenance summary + partial-context diagnostics. Also carries the request
// meta Batch 4.6 will persist (no second conversation store).
export interface SharedContextEnvelope {
  mode: string;
  surface: string | null;
  entityType: string | null;
  entityId: string | null;
  organizationId: string | null;
  userId: string | null;
  conversationId: string | null;
  text: string;                        // rendered, permission-safe context block
  provenanceCount: number;             // summary only (never raw chain-of-thought)
  failedLayers: string[];
  truncated: Record<string, number>;
}

/** Optional context a caller passes so Ask uses the shared assembler for its surface. */
export interface AskContextInput {
  surface?: string;
  entityType?: string;
  entityId?: string;
  mode?: string;            // ContextMode; defaults chosen by the service
  userId?: string;
  conversationId?: string;
  /** Stable per-chat session id (Batch 4.6) — used to persist + rehydrate the
   *  conversation via the existing zono_ask_* store. Absent → no persistence. */
  sessionId?: string;
}

export interface AskZonoResponse {
  version: string; generatedAt: string;
  understanding: QueryUnderstanding;
  plan: ContextPlan;
  results: EngineResult[];
  answer: AskAnswer;
  notes: string[];
  sharedContext?: SharedContextEnvelope; // present when a surface passes entity context
}
