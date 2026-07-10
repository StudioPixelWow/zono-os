// ============================================================================
// 🔐 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · modes (PURE).
// ONE sensitivity + caps policy for the whole platform. Every reasoning surface
// picks a mode; the shared assembler applies the mode's policy — which layers to
// include, the memory sensitivity ceiling, per-layer hard caps, whether
// user-private memory is allowed, and whether it's a broad prompt (drops
// confidential/restricted). No surface gets a broad permissive mode by default.
// Pure + deterministic + offline-testable.
// ============================================================================
import type { Sensitivity } from "@/lib/memory-canonical/types";

export type ContextMode =
  | "internal_entity"          // a broker on one entity's cockpit/Ask
  | "internal_global"          // org-wide internal Ask (Home / Command / global)
  | "executive"                // manager / office — org memory, NEVER broker-private
  | "broker_private"           // a broker's own private context
  | "public_site"              // public website Ask widgets — public-safe only
  | "document_scoped"          // document-assist — authorized doc context
  | "recommendation_explanation"; // enrich a recommendation's "why"

export interface ModePolicy {
  sensitivityCeiling: Sensitivity;  // drop memory ABOVE this
  includeTruth: boolean;
  includeTimeline: boolean;
  includeGraph: boolean;
  includeMemory: boolean;
  includeRecommendations: boolean;
  includePreferences: boolean;
  includeUserPrivate: boolean;      // may include the caller's own private memory
  includeDocuments: boolean;
  forBroadPrompt: boolean;          // extra render-time drop of confidential/restricted
  caps: { timeline: number; graph: number; memory: number; recommendations: number; preferences: number };
}

const CAPS_STD = { timeline: 6, graph: 8, memory: 12, recommendations: 5, preferences: 6 };
const CAPS_SMALL = { timeline: 4, graph: 5, memory: 8, recommendations: 4, preferences: 4 };

// The single policy table. Public/executive are the strict ones by construction.
export const CONTEXT_MODES: Record<ContextMode, ModePolicy> = {
  internal_entity: {
    sensitivityCeiling: "restricted", includeTruth: true, includeTimeline: true, includeGraph: true,
    includeMemory: true, includeRecommendations: true, includePreferences: true, includeUserPrivate: true,
    includeDocuments: false, forBroadPrompt: false, caps: CAPS_STD,
  },
  internal_global: {
    sensitivityCeiling: "confidential", includeTruth: true, includeTimeline: true, includeGraph: true,
    includeMemory: true, includeRecommendations: true, includePreferences: true, includeUserPrivate: true,
    includeDocuments: false, forBroadPrompt: false, caps: CAPS_STD,
  },
  executive: {
    // Org-wide manager view — broker-PRIVATE memory is never included.
    sensitivityCeiling: "confidential", includeTruth: true, includeTimeline: true, includeGraph: true,
    includeMemory: true, includeRecommendations: true, includePreferences: true, includeUserPrivate: false,
    includeDocuments: false, forBroadPrompt: true, caps: CAPS_STD,
  },
  broker_private: {
    sensitivityCeiling: "restricted", includeTruth: true, includeTimeline: true, includeGraph: true,
    includeMemory: true, includeRecommendations: true, includePreferences: true, includeUserPrivate: true,
    includeDocuments: false, forBroadPrompt: false, caps: CAPS_STD,
  },
  public_site: {
    // STRICT public-safe: only normal-sensitivity truth; NO memory/graph/recs/docs.
    sensitivityCeiling: "normal", includeTruth: true, includeTimeline: false, includeGraph: false,
    includeMemory: false, includeRecommendations: false, includePreferences: false, includeUserPrivate: false,
    includeDocuments: false, forBroadPrompt: true, caps: { timeline: 0, graph: 0, memory: 0, recommendations: 0, preferences: 0 },
  },
  document_scoped: {
    sensitivityCeiling: "confidential", includeTruth: true, includeTimeline: true, includeGraph: true,
    includeMemory: true, includeRecommendations: false, includePreferences: false, includeUserPrivate: false,
    includeDocuments: true, forBroadPrompt: false, caps: CAPS_SMALL,
  },
  recommendation_explanation: {
    sensitivityCeiling: "internal", includeTruth: true, includeTimeline: true, includeGraph: true,
    includeMemory: true, includeRecommendations: true, includePreferences: false, includeUserPrivate: false,
    includeDocuments: false, forBroadPrompt: false, caps: CAPS_SMALL,
  },
};

export function modePolicy(mode: ContextMode): ModePolicy {
  return CONTEXT_MODES[mode] ?? CONTEXT_MODES.internal_entity;
}

const SENS_RANK: Record<Sensitivity, number> = { normal: 0, internal: 1, confidential: 2, restricted: 3 };

/** Is a sensitivity allowed under a mode's ceiling? */
export function sensitivityAllowed(mode: ContextMode, sensitivity: Sensitivity): boolean {
  return SENS_RANK[sensitivity] <= SENS_RANK[modePolicy(mode).sensitivityCeiling];
}
