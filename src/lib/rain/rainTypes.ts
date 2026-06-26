// ============================================================================
// ZONO — PHASE 26.9: RAIN Network / AI War Room Foundation™.
// CLIENT-SAFE DTO types for the strategic intelligence graph. No server-only
// deps, no IO — shared between the server graph layer and any future War Room
// UI, and unit-tested directly. Real data only: importance/strength are NULL
// when not computable (never a fabricated 0).
// ============================================================================

export type RainNodeType =
  | "agency" | "agent" | "property" | "deal" | "city"
  | "neighborhood" | "street" | "developer" | "project" | "signal";

export type RainEdgeType =
  | "belongs_to" | "lists" | "sold" | "located_in" | "dominates"
  | "competes_with" | "connected_to" | "works_with" | "markets" | "triggered_signal";

export type RainConfidence = "low" | "medium" | "high";

export interface RainNode {
  id: string;
  nodeType: RainNodeType;
  entityId: string;
  label: string;
  subtitle: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  importanceScore: number | null;   // 0..100, null when not enough data
  confidence: RainConfidence;
  metadata: Record<string, unknown>;
}

export interface RainEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: RainEdgeType;
  strength: number | null;          // 0..100, null when not computable
  confidence: RainConfidence;
  evidence: Record<string, unknown>;
  active: boolean;
}

export interface RainStats {
  totalNodes: number;
  totalEdges: number;
  agencies: number;
  agents: number;
  properties: number;
  territories: number;     // city + neighborhood + street nodes
  activeSignals: number;
  highThreatCompetitors: number;
}

export interface RainConfidenceSummary {
  high: number;
  medium: number;
  low: number;
  scoredNodes: number;     // nodes with a non-null importance score
  unscoredNodes: number;   // nodes with null importance (honest "not enough data")
}

/** UI-ready graph payload (ready for future visualization). */
export interface RainGraph {
  nodes: RainNode[];
  edges: RainEdge[];
  stats: RainStats;
  confidence: RainConfidenceSummary;
}

// ── Filters ──────────────────────────────────────────────────────────────────
export interface RainNodeFilters {
  nodeType?: RainNodeType;
  city?: string | null;
  neighborhood?: string | null;
  limit?: number;
}
export interface RainEdgeFilters {
  edgeType?: RainEdgeType;
  nodeId?: string;        // edges touching this node (source or target)
  activeOnly?: boolean;
  limit?: number;
}

// ── Write inputs (server-side; node id is resolved by the repository) ─────────
export interface UpsertNodeInput {
  nodeType: RainNodeType;
  entityId: string;
  label: string;
  subtitle?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  importanceScore: number | null;
  confidence: RainConfidence;
  metadata?: Record<string, unknown>;
}
export interface UpsertEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: RainEdgeType;
  strength: number | null;
  confidence: RainConfidence;
  evidence?: Record<string, unknown>;
  active?: boolean;
}
