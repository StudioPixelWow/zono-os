// ============================================================================
// 👤 ZONO Digital Twin Framework™ — universal types (pure). 28.1.
// ----------------------------------------------------------------------------
// ONE reusable Digital Twin model that EVERY CRM/business entity in ZONO will
// become (Buyer is the first implementation). The framework is entity-agnostic:
// it holds identity, profile (generic payload), memory, truth, relationships,
// intelligence, decision/mission signals, activity, health, confidence and
// learning. NO entity-specific code lives here. It composes the existing engines
// (Truth / Relationship / Organizational Memory / Decision / Mission / Chief of
// Staff) read-only — nothing duplicated, no protected engine modified.
// ============================================================================
export const DIGITAL_TWIN_VERSION = "28.1";

// Part 2 — supported twin entity types (extensible; any future string).
export type TwinEntityType =
  | "buyer" | "seller" | "lead" | "broker" | "office" | "property"
  | "project" | "developer" | "campaign" | (string & {});

export interface TwinIdentity {
  id: string; entityType: TwinEntityType; name: string;
  createdAt: string | null; updatedAt: string | null;
}

// Part 4 — activity (generic, entity-agnostic).
export type ActivityKind =
  | "view" | "save" | "reject" | "call" | "meeting" | "message" | "visit"
  | "offer" | "search" | "note" | "task" | "other" | (string & {});
export interface TwinActivity {
  id: string; kind: ActivityKind; at: string; summary: string; weight: number;
}
export interface TwinMemory {
  activities: TwinActivity[];
  counts: Record<string, number>;
  totalActivities: number;
  lastActivityAt: string | null;
  activeDays: number;              // distinct days with activity
  recencyScore: number;            // 0..100 (fresh engagement)
  engagementScore: number;         // 0..100 (volume + variety)
}

// Part 1 — health & confidence.
export interface TwinHealth {
  score: number;                   // 0..100 overall twin health
  engagement: number; freshness: number; completeness: number; risk: number;
  label: "בריא" | "יציב" | "בסיכון" | "רדום" | "ריק";
  basis: string[];
}

// Part 8 — reused-engine summaries (read-only, never recomputed here).
export interface TwinTruthSummary {
  truthScore: number; confidence: number; verification: string; freshness: number; missing: string[];
}
export interface TwinRelationshipSummary {
  count: number; degree: number;
  strongest: { to: string; type: string; strength: number }[];
}

// Intelligence — decision & mission signals (ranked, evidence-based).
export interface TwinDecisionSignal {
  id: string; action: string; priority: number; reason: string; evidence: string[];
  readiness: "ready" | "needs_info" | "wait";
}
export interface TwinMissionSignal {
  id: string; missionType: string; title: string; priority: number; reason: string;
}

// Part 5 — learning.
export interface TwinLearning {
  id: string; type: string; note: string; confidence: number; evidence: string[];
}

// The universal Digital Twin (profile is the entity-specific payload).
export interface DigitalTwin<TProfile = Record<string, unknown>> {
  version: string;
  identity: TwinIdentity;
  profile: TProfile;
  memory: TwinMemory;
  health: TwinHealth;
  confidence: number;              // 0..100 — data completeness behind the twin
  truth: TwinTruthSummary | null;
  relationships: TwinRelationshipSummary | null;
  orgMemoryLessons: string[];
  decisions: TwinDecisionSignal[];
  missions: TwinMissionSignal[];
  learnings: TwinLearning[];
  classification: string[];        // entity-provided tags (e.g. hot/luxury)
  notes: string[];
}
