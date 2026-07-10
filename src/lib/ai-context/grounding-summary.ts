// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · grounding summary (PURE).
// The ONE client-safe shape surfaces attach so their AI narrative is traceable to
// structured provenance — provenance counts + partial-context diagnostics, never
// raw private content. Pure + client-importable (no server-only import).
// ============================================================================
export interface GroundedSummary {
  mode: string;
  contextText: string;                    // permission-safe rendered block (or "")
  provenance: { total: number; explicit: number; derived: number; inferred: number };
  staleCount: number;
  failedLayers: string[];
  truncated: Record<string, number>;
  hasSignal: boolean;
}
