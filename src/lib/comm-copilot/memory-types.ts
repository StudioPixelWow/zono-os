// ============================================================================
// 🧠 ZONO — Copilot AI MEMORY types (Batch 6.7 Phase 4). Deterministic, no LLM.
// ----------------------------------------------------------------------------
// Long-term, evidence-based, confidence-scored, versioned customer memory. Every
// field records provenance (explicit vs inferred), first-seen / last-updated,
// supporting message ids, and a version. Merge rules never overwrite a stronger
// memory with a weaker one; contradictions are tracked, not silently dropped.
// Represented generically (scalars + lists) so merge is uniform across the whole
// taxonomy (personal / property / financing / behavior).
// ============================================================================

export type MemoryProvenance = "explicit" | "inferred";

/** A single-valued memory field. */
export interface ScalarMemory {
  value: string;
  confidence: number;            // 0–100
  source: MemoryProvenance;
  firstSeen: string;             // ISO
  lastUpdated: string;           // ISO
  evidenceMessageIds: string[];
  version: number;               // bumped on value change
}

/** One accumulated value within a list field (preferences accumulate). */
export interface ListMemoryItem {
  value: string;
  confidence: number;
  source: MemoryProvenance;
  firstSeen: string;
  evidenceMessageIds: string[];
}

/** A tracked contradiction between an old and a new explicit value. */
export interface MemoryContradiction {
  field: string;
  from: string;
  to: string;
  at: string;
  evidenceMessageIds: string[];
}

/** A change produced by a merge (explainability for the update). */
export interface MemoryChange {
  field: string;
  why: "new" | "upgrade" | "explicit_over_inferred" | "latest_explicit" | "contradiction" | "downgrade" | "accumulate";
  from: string | null;
  to: string;
  confidence: number;
  evidenceMessageIds: string[];
}

/** The full customer memory. Scalars + lists are keyed by dotted field names
 *  (e.g. "personal.familyStatus", "property.cities"). */
export interface CopilotMemory {
  scalars: Record<string, ScalarMemory>;
  lists: Record<string, ListMemoryItem[]>;
  budgetEvolution: { amount: number; at: string }[];
  contradictions: MemoryContradiction[];
  firstSeen: string;
  lastUpdated: string;
  version: number;
}

/** What a single extraction pass found (before merge). */
export interface ExtractedScalar { value: string; confidence: number; source: MemoryProvenance; evidenceMessageIds: string[] }
export interface PartialMemory {
  scalars: Record<string, ExtractedScalar>;
  lists: Record<string, ExtractedScalar[]>;
  budget: number | null;         // for budget-evolution tracking
}

/** The canonical field taxonomy (documentation + QA coverage). */
export const MEMORY_SCALARS = [
  "personal.familyStatus", "personal.children", "personal.pets", "personal.occupation",
  "property.budget", "property.rooms", "property.parking", "property.balcony", "property.garden",
  "property.elevator", "property.floor", "property.accessibility",
  "financing.financingNeeded", "financing.mortgageStatus", "financing.financingApproved",
  "financing.cashBuyer", "financing.existingPropertyToSell",
  "behavior.urgency", "behavior.timeline", "behavior.preferredCommunicationHours",
] as const;
export const MEMORY_LISTS = [
  "personal.lifestyle", "property.cities", "property.neighborhoods", "property.projects",
  "property.propertyTypes", "behavior.motivations", "behavior.objections", "behavior.dealBreakers",
] as const;

export function emptyMemory(nowIso: string): CopilotMemory {
  return { scalars: {}, lists: {}, budgetEvolution: [], contradictions: [], firstSeen: nowIso, lastUpdated: nowIso, version: 0 };
}
