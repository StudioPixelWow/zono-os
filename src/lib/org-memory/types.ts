// ============================================================================
// 🧠 ZONO Organizational Memory™ & Learning Brain — types (pure). 27.8.
// ----------------------------------------------------------------------------
// ONE organizational memory for the whole platform. ZONO remembers what
// happened, what worked, what failed, what improved and what repeated. The
// memory belongs to the ORGANIZATION — never to the LLM. It is DERIVED from
// real, already-persisted history (mission outcomes + history), so nothing is
// fabricated and no schema is added. Reuses existing modules; does NOT modify
// Discovery / Knowledge Graph / Truth / Decision / Mission / Chief of Staff /
// Valuation / MAI.
// ============================================================================
export const ORG_MEMORY_VERSION = "27.8";

// Part 1 — memory event types (extensible; unknown strings allowed).
export type MemoryEventType =
  | "mission_completed" | "mission_failed" | "mission_created"
  | "listing_sold" | "property_expired" | "seller_signed" | "buyer_purchased"
  | "broker_recruited" | "broker_left" | "campaign_launched" | "campaign_succeeded"
  | "campaign_failed" | "office_expanded" | "territory_won" | "territory_lost"
  | (string & {});

export type Outcome = "success" | "failure" | "neutral";
export type Impact = "high" | "medium" | "low";

export interface MemoryEvent {
  id: string;
  at: string;                       // ISO date of the event
  type: MemoryEventType;
  outcome: Outcome;
  entityType: string; entityId: string | null; entityName: string | null;
  reason: string;                   // why it happened (from real detail)
  impact: Impact;
  outcomeText: string;              // human outcome summary
  evidence: string[];               // linked evidence (real)
  category: string;                 // grouping key (e.g. mission type)
}

// Part 2 — chronological timeline.
export interface TimelineEntry {
  at: string; type: MemoryEventType; outcome: Outcome;
  entity: string; reason: string; impact: Impact; outcomeText: string; evidence: string[];
}

// Part 3/4 — success & failure patterns.
export type PatternKind = "success" | "failure";
export interface Pattern {
  id: string; kind: PatternKind; key: string; title: string;
  occurrences: number; entities: string[]; category: string;
  evidence: string[]; firstAt: string | null; lastAt: string | null;
  impact: Impact;
  cases: { at: string; entity: string; outcomeText: string }[];
}

// Part 5 + 9 — organizational learning objects (with explainability).
export interface Learning {
  id: string; kind: PatternKind; key: string; title: string;
  evidence: string[]; occurrences: number; confidence: number;   // 0..100
  businessImpact: Impact; recommendation: string;
  affectedEntities: string[];
  cases: { at: string; entity: string; outcomeText: string }[];  // historical cases
  why: string;                                                    // why the learning exists
}

// Part 6 — how a decision would improve from history (advisory; DE not modified).
export interface DecisionImprovement {
  category: string;                 // decision category the learning maps to
  learningKey: string;
  direction: "boost" | "caution";   // raise priority vs add caution
  delta: number;                    // suggested priority nudge (-/+)
  note: string; confidence: number; evidence: string[];
}

// Part 7 — Chief-of-Staff memory answers.
export interface MemoryAnswer { question: string; answer: string; evidence: string[]; confidence: number }

// Part 8 — executive memory.
export interface ExecutiveMemory {
  topSuccesses: Learning[];
  topFailures: Learning[];
  biggestImprovements: { key: string; note: string; occurrences: number }[];
  recurringProblems: { key: string; note: string; occurrences: number }[];
  lessonsLearned: string[];
}

export interface OrgMemoryReport {
  version: string; orgId: string | null; generatedAt: string;
  totals: { events: number; successes: number; failures: number; neutral: number };
  timeline: TimelineEntry[];
  successPatterns: Pattern[];
  failurePatterns: Pattern[];
  learnings: Learning[];
  decisionImprovements: DecisionImprovement[];
  chiefOfStaffAnswers: MemoryAnswer[];
  executiveMemory: ExecutiveMemory;
  notes: string[];
}
