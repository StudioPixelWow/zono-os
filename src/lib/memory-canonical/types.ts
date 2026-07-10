// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · types (PURE).
// The single durable-memory vocabulary. Every canonical memory is org-scoped,
// carries a concise fact + provenance (explicit|derived|inferred) + sensitivity
// + a stable identity, and points back to its source domain event.
// ============================================================================

export type MemoryScope = "organization" | "user" | "entity" | "conversation";
export type Provenance = "explicit" | "derived" | "inferred";
export type Sensitivity = "normal" | "internal" | "confidential" | "restricted";

/** The controlled memory-type vocabulary (no arbitrary categories). */
export type MemoryType =
  | "preference" | "constraint" | "commitment" | "outcome" | "relationship"
  | "risk" | "milestone" | "behavior_pattern" | "communication_preference"
  | "business_rule" | "office_preference" | "broker_preference"
  | "document_fact" | "meeting_outcome" | "recommendation_feedback";

export const MEMORY_TYPES: MemoryType[] = [
  "preference", "constraint", "commitment", "outcome", "relationship", "risk",
  "milestone", "behavior_pattern", "communication_preference", "business_rule",
  "office_preference", "broker_preference", "document_fact", "meeting_outcome",
  "recommendation_feedback",
];

export interface EntityRef { type: string; id: string }

/** A salient memory the subscriber wants to persist (before conflict resolution). */
export interface MemoryOpIntent {
  scope: MemoryScope;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  memoryType: MemoryType;
  /** Short human label. */
  title: string;
  /** The concise fact, human-readable. */
  fact: string;
  /** The stable DIMENSION this memory is about (e.g. "budget") — constant across
   *  values, so a new value supersedes the old one under the same identity. */
  normalizedFactKey: string;
  confidence: number; // 0..100
  sensitivity: Sensitivity;
  provenance: Provenance;
  sourceEntityRefs: EntityRef[];
}

/** Provenance rank — explicit outranks derived outranks inferred. */
export const PROVENANCE_RANK: Record<Provenance, number> = { explicit: 3, derived: 2, inferred: 1 };
