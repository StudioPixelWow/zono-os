// ============================================================================
// 🕸️ ZONO Relationship Intelligence™ & Universal Entity Graph — types (pure). 27.9.
// ----------------------------------------------------------------------------
// The relationship layer for the whole platform. Every entity knows how it
// relates to every other entity — relationships become first-class citizens
// with strength, confidence, evidence, duration, freshness and verification.
// It does NOT replace Discovery or the Knowledge Graph; it connects entities
// using ONLY real, already-persisted evidence. Reuses Truth-Engine freshness.
// No modification to any protected engine.
// ============================================================================
export const RELATIONSHIP_GRAPH_VERSION = "27.9";

// Part 1 — entity-agnostic node types (known set + any future string).
export type EntityType =
  | "organization" | "office" | "broker" | "property" | "listing" | "seller"
  | "buyer" | "lead" | "mission" | "decision" | "campaign" | "territory"
  | "neighborhood" | "street" | "market" | "valuation" | (string & {});

// Part 2 — relationship types (extensible).
export type RelationType =
  | "owns" | "managed_by" | "works_at" | "worked_at" | "represents" | "referred"
  | "introduced" | "collaborated" | "competed_with" | "sold" | "bought"
  | "assigned_to" | "created" | "completed" | "supports" | "conflicts_with"
  | "depends_on" | "related_to" | (string & {});

export const RELATION_HE: Record<string, string> = {
  owns: "בעלות", managed_by: "מנוהל ע״י", works_at: "עובד ב", worked_at: "עבד ב",
  represents: "מייצג", referred: "הפנה", introduced: "הכיר", collaborated: "שיתף פעולה",
  competed_with: "התחרה עם", sold: "מכר", bought: "קנה", assigned_to: "משויך ל",
  created: "יצר", completed: "השלים", supports: "תומך", conflicts_with: "בסתירה עם",
  depends_on: "תלוי ב", related_to: "קשור ל", has_journey: "מסע",
};

export type FreshnessLevel = "fresh" | "recent" | "stale" | "expired" | "unknown";
export type VerificationLevel = "unverified" | "single_source" | "corroborated" | "verified";

export interface GraphNode {
  id: string; type: EntityType; name: string;
  degree: number;                  // number of incident edges
  weightedDegree: number;          // sum of incident edge strengths
}

// Part 3 — a relationship edge is a first-class citizen.
export interface RelationshipEdge {
  id: string; from: string; to: string; fromType: EntityType; toType: EntityType;
  type: RelationType;
  strength: number;                // 0..100
  confidence: number;              // 0..100 (capped by evidence)
  occurrences: number;             // how many evidence instances
  evidence: string[];
  sources: string[];
  firstAt: string | null; lastAt: string | null;   // duration
  durationDays: number | null;
  freshness: number; freshnessLevel: FreshnessLevel;
  verification: VerificationLevel;
  // Part 9 — explainability.
  explanation: { why: string; evidence: string[]; history: string; confidence: number; verification: VerificationLevel };
}

export interface EntityGraph {
  nodes: GraphNode[]; edges: RelationshipEdge[];
  counts: { nodes: number; edges: number; byType: Record<string, number> };
}

// Raw relation before aggregation (Part 5 — discovery output).
export interface RawRelation {
  from: string; to: string; fromType: EntityType; toType: EntityType;
  type: RelationType; at: string | null; source: string; evidence: string;
}

// Part 4 — network analysis.
export interface RankedNode { id: string; name: string; type: EntityType; degree: number; weightedDegree: number }
export interface HiddenOpportunity {
  a: string; b: string; aName: string; bName: string; sharedNeighbors: number;
  suggestion: string; evidence: string[];
}
export interface NetworkAnalysis {
  mostConnectedBrokers: RankedNode[];
  mostInfluentialOffices: RankedNode[];
  strongestRelationships: RelationshipEdge[];
  weakRelationships: RelationshipEdge[];
  disconnectedEntities: RankedNode[];
  hiddenOpportunities: HiddenOpportunity[];
  networkHealth: number;           // 0..100
}

// Part 6 — Chief-of-Staff relationship answers.
export interface RelationshipAnswer { statement: string; evidence: string[]; confidence: number }

// Part 7 — decision influence (advisory; DE not modified).
export interface RelationshipInfluence {
  entityId: string; entityName: string; avgStrength: number;
  direction: "increase" | "decrease" | "neutral"; delta: number; note: string; verification: VerificationLevel;
}

// Part 8 — executive relationship dashboard.
export interface ExecutiveGraph {
  mostConnected: RankedNode[];
  strategicRelationships: RelationshipEdge[];
  missingRelationships: HiddenOpportunity[];
  growthOpportunities: string[];
  networkHealth: number;
  totals: { nodes: number; edges: number; strong: number; weak: number; disconnected: number };
}

export interface RelationshipReport {
  version: string; orgId: string | null; generatedAt: string;
  graph: EntityGraph;
  network: NetworkAnalysis;
  executive: ExecutiveGraph;
  chiefOfStaffAnswers: RelationshipAnswer[];
  decisionInfluences: RelationshipInfluence[];
  notes: string[];
}
